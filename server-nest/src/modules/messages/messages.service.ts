import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  Block,
  ConversationSetting,
  Message,
  User,
} from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { checkSensitive } from '../../common/sensitive';
import { ConversationSettingsDto, SendMessageDto } from './dto/message.dto';

/**
 * Ported from server/src/routes/messages.js. Conversation list (latest message
 * + unread per peer), unread badge count, per-conversation pin/mute settings,
 * thread read, conversation delete, and message send. Shapes match Express.
 */
@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(ConversationSetting)
    private readonly settings: Repository<ConversationSetting>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Block) private readonly blocks: Repository<Block>,
    private readonly helpers: HelpersService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private pairQb(me: number, peer: number) {
    return this.messages
      .createQueryBuilder('m')
      .where(
        new Brackets((qb) => {
          qb.where('m.sender_id = :me AND m.receiver_id = :peer', {
            me,
            peer,
          }).orWhere('m.sender_id = :peer AND m.receiver_id = :me', {
            me,
            peer,
          });
        }),
      );
  }

  // ---- GET /api/messages ----
  async conversations(user: User) {
    const me = user.id;
    const peers: { peer: number; last_at: string }[] = await this.messages
      .createQueryBuilder('m')
      .select(
        'CASE WHEN m.sender_id = :me THEN m.receiver_id ELSE m.sender_id END',
        'peer',
      )
      .addSelect('MAX(m.created_at)', 'last_at')
      .where('m.sender_id = :me OR m.receiver_id = :me', { me })
      .groupBy('peer')
      .orderBy('last_at', 'DESC')
      .setParameter('me', me)
      .getRawMany();

    const conversations: any[] = [];
    for (const p of peers) {
      const peerId = Number(p.peer);
      const last = await this.pairQb(me, peerId)
        .orderBy('m.created_at', 'DESC')
        .getOne();
      const unread = await this.messages.count({
        where: { sender_id: peerId, receiver_id: me, read: 0 },
      });
      const s = await this.settings.findOne({
        where: { user_id: me, peer_id: peerId },
      });
      conversations.push({
        peer: await this.helpers.publicUser(
          await this.helpers.getUser(peerId),
          me,
        ),
        last,
        unread,
        pinned: !!s?.pinned,
        muted: !!s?.muted,
      });
    }
    conversations.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return { conversations };
  }

  // ---- GET /api/messages/unread ----
  async unread(user: User) {
    const c = await this.messages
      .createQueryBuilder('m')
      .where('m.receiver_id = :me AND m.read = 0', { me: user.id })
      .andWhere(
        'm.sender_id NOT IN (SELECT peer_id FROM conversation_settings WHERE user_id = :me AND muted = 1)',
        { me: user.id },
      )
      .getCount();
    return { unread: c };
  }

  // ---- POST /api/messages/:peerId/settings ----
  async updateSettings(user: User, peerId: number, dto: ConversationSettingsDto) {
    const me = user.id;
    const cur = (await this.settings.findOne({
      where: { user_id: me, peer_id: peerId },
    })) || { pinned: 0, muted: 0 };
    const pinned =
      dto.pinned === undefined ? cur.pinned : dto.pinned ? 1 : 0;
    const muted = dto.muted === undefined ? cur.muted : dto.muted ? 1 : 0;
    await this.settings
      .createQueryBuilder()
      .insert()
      .into(ConversationSetting)
      .values({
        user_id: me,
        peer_id: peerId,
        pinned,
        muted,
        updated_at: this.helpers.nowSql(),
      })
      .orUpdate(['pinned', 'muted', 'updated_at'], ['user_id', 'peer_id'])
      .execute();
    return { pinned: !!pinned, muted: !!muted };
  }

  // ---- GET /api/messages/:peerId ----
  async thread(user: User, peerId: number) {
    const me = user.id;
    const msgs = await this.pairQb(me, peerId)
      .orderBy('m.created_at', 'ASC')
      .limit(200)
      .getMany();
    await this.messages.update(
      { sender_id: peerId, receiver_id: me },
      { read: 1 },
    );
    return {
      peer: await this.helpers.publicUser(
        await this.helpers.getUser(peerId),
        me,
      ),
      messages: msgs,
    };
  }

  // ---- DELETE /api/messages/:peerId ----
  async remove(user: User, peerId: number) {
    const me = user.id;
    await this.messages
      .createQueryBuilder()
      .delete()
      .from(Message)
      .where(
        '(sender_id = :me AND receiver_id = :peer) OR (sender_id = :peer AND receiver_id = :me)',
        { me, peer: peerId },
      )
      .execute();
    await this.settings.delete({ user_id: me, peer_id: peerId });
    return { ok: true };
  }

  // ---- POST /api/messages/:peerId ----
  async send(user: User, peerId: number, dto: SendMessageDto) {
    await this.rateLimit.enforce('dm', user); // 防私信骚扰：超频抛 429（管理员豁免/开关关则放行）
    await this.helpers.enforcePerm('dm', user); // 接口权限门控（默认关；开启后可要求私信需 VIP/等级）
    const me = user.id;
    const content = (dto.content || '').trim();
    const type = dto.type === 'image' ? 'image' : 'text';
    if (!content) throw new BadRequestException('消息不能为空');
    if (type === 'text' && checkSensitive(content))
      throw new BadRequestException('消息包含敏感信息，请修改后重试');
    if (!(await this.helpers.getUser(peerId)))
      throw new NotFoundException('对方不存在');
    // 拉黑校验（双向）：对方拉黑了我 → 不能发；我拉黑了对方 → 先解除才能发。防止拉黑后仍被私信骚扰。
    if (me !== peerId) {
      const [peerBlockedMe, iBlockedPeer] = await Promise.all([
        this.blocks.findOne({ where: { blocker_id: peerId, blocked_id: me } }),
        this.blocks.findOne({ where: { blocker_id: me, blocked_id: peerId } }),
      ]);
      if (peerBlockedMe)
        throw new ForbiddenException('对方已拉黑你，无法发送私信');
      if (iBlockedPeer)
        throw new ForbiddenException('你已拉黑对方，请先在对方主页解除拉黑');
    }
    const saved = await this.messages.save(
      this.messages.create({
        sender_id: me,
        receiver_id: peerId,
        content,
        type,
        created_at: this.helpers.nowSql(),
      }),
    );
    const msg = await this.messages.findOne({ where: { id: saved.id } });
    return { message: msg };
  }
}
