import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Answer,
  AnswerVote,
  Question,
  User,
} from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { checkSensitive } from '../../common/sensitive';
import { AnswerDto, AskQuestionDto } from './dto/qa.dto';

/**
 * Ported from server/src/routes/qa.js. Questions + answers + answer votes with
 * an optional 积分 bounty escrow. Response shapes match the Express version.
 */
@Injectable()
export class QaService {
  constructor(
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
    @InjectRepository(Answer) private readonly answers: Repository<Answer>,
    @InjectRepository(AnswerVote)
    private readonly answerVotes: Repository<AnswerVote>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly helpers: HelpersService,
    private readonly dataSource: DataSource,
  ) {}

  private async serializeQuestion(
    row: Question,
    viewerId: number | null,
    { withBody = false }: { withBody?: boolean } = {},
  ) {
    return {
      id: row.id,
      title: row.title,
      body: withBody ? row.body : undefined,
      excerpt: withBody
        ? undefined
        : (row.body || '').replace(/\s+/g, ' ').slice(0, 80),
      category: row.category,
      bounty: row.bounty,
      status: row.status,
      bestAnswerId: row.best_answer_id || null,
      answerCount: row.answer_count,
      viewCount: row.view_count,
      createdAt: row.created_at,
      isAsker: viewerId === row.user_id,
      author: await this.helpers.publicUser(
        await this.helpers.getUser(row.user_id),
        viewerId,
      ),
    };
  }

  private async serializeAnswer(row: Answer, viewerId: number | null) {
    return {
      id: row.id,
      content: row.content,
      voteCount: row.vote_count,
      accepted: !!row.accepted,
      createdAt: row.created_at,
      voted: viewerId
        ? !!(await this.answerVotes.findOne({
            where: { answer_id: row.id, user_id: viewerId },
          }))
        : false,
      author: await this.helpers.publicUser(
        await this.helpers.getUser(row.user_id),
        viewerId,
      ),
    };
  }

  private async mapQuestions(rows: Question[], viewerId: number | null) {
    const out: any[] = [];
    for (const r of rows) out.push(await this.serializeQuestion(r, viewerId));
    return out;
  }

  // ---- GET /api/qa ----
  async list(
    status: string | undefined,
    category: string | undefined,
    sort: string | undefined,
    viewer: User | null,
    q?: string,
  ) {
    let qb = this.questions.createQueryBuilder('q');
    let hasWhere = false;
    if (status === 'open' || status === 'solved') {
      qb = qb.where('q.status = :status', { status });
      hasWhere = true;
    }
    if (category && category !== '全部') {
      qb = hasWhere
        ? qb.andWhere('q.category = :category', { category })
        : qb.where('q.category = :category', { category });
      hasWhere = true;
    }
    const term = (q || '').trim();
    if (term) {
      const like = `%${term}%`;
      qb = hasWhere
        ? qb.andWhere('q.title LIKE :like', { like })
        : qb.where('q.title LIKE :like', { like });
      hasWhere = true;
    }
    if (sort === 'bounty')
      qb = qb.orderBy('q.bounty', 'DESC').addOrderBy('q.created_at', 'DESC');
    else if (sort === 'hot')
      qb = qb
        .orderBy('q.answer_count', 'DESC')
        .addOrderBy('q.view_count', 'DESC')
        .addOrderBy('q.created_at', 'DESC');
    else qb = qb.orderBy('q.created_at', 'DESC');
    const rows = await qb.limit(50).getMany();
    return { questions: await this.mapQuestions(rows, viewer?.id || null) };
  }

  // ---- GET /api/qa/spotlight ----
  async spotlight(viewer: User | null) {
    const rows = await this.questions.find({
      where: { status: 'open' },
      order: { bounty: 'DESC', created_at: 'DESC' },
      take: 5,
    });
    return { questions: await this.mapQuestions(rows, viewer?.id || null) };
  }

  // ---- GET /api/qa/:id ----
  async detail(id: number, viewer: User | null) {
    const row = await this.questions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('问题不存在');
    await this.questions.increment({ id: row.id }, 'view_count', 1);
    const answers = await this.answers.find({
      where: { question_id: row.id },
      order: { accepted: 'DESC', vote_count: 'DESC', created_at: 'ASC' },
    });
    const ser: any[] = [];
    for (const a of answers)
      ser.push(await this.serializeAnswer(a, viewer?.id || null));
    return {
      question: await this.serializeQuestion(row, viewer?.id || null, {
        withBody: true,
      }),
      answers: ser,
    };
  }

  // ---- POST /api/qa ----
  async ask(user: User, dto: AskQuestionDto) {
    let title = (dto.title || '').trim();
    const body = dto.body || '';
    const category = dto.category || '综合';
    if (!title) throw new BadRequestException('请填写问题标题');
    if (title.length > 60) throw new BadRequestException('标题最多 60 字');
    let bounty = Math.max(0, Math.min(9999, Math.floor(Number(dto.bounty) || 0)));
    if (checkSensitive(title) || checkSensitive(body))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const u = await this.users.findOne({
      where: { id: user.id },
      select: ['points'],
    });
    if (bounty > 0 && (u?.points ?? 0) < bounty)
      throw new HttpException('积分不足，无法设置该悬赏', 402);

    const saved = await this.questions.save(
      this.questions.create({
        user_id: user.id,
        title: title.slice(0, 60),
        body: body.slice(0, 2000),
        category,
        bounty,
        created_at: this.helpers.nowSql(),
      }),
    );
    if (bounty > 0)
      await this.users.decrement({ id: user.id }, 'points', bounty);
    await this.helpers.award(user.id, { exp: 5 }, 'question');
    const row = await this.questions.findOne({ where: { id: saved.id } });
    return {
      question: await this.serializeQuestion(row!, user.id, { withBody: true }),
    };
  }

  // ---- POST /api/qa/:id/answers ----
  async answer(id: number, user: User, dto: AnswerDto) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('问题不存在');
    const content = (dto.content || '').trim();
    if (!content) throw new BadRequestException('回答内容不能为空');
    if (checkSensitive(content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const saved = await this.answers.save(
      this.answers.create({
        question_id: q.id,
        user_id: user.id,
        content: content.slice(0, 2000),
        created_at: this.helpers.nowSql(),
      }),
    );
    await this.questions.increment({ id: q.id }, 'answer_count', 1);
    await this.helpers.award(user.id, { exp: 4, points: 1 }, 'answer');
    if (q.user_id !== user.id)
      await this.helpers.notify({
        userId: q.user_id,
        actorId: user.id,
        type: 'answer',
        targetType: 'question',
        targetId: q.id,
        preview: content.slice(0, 60),
      });
    const row = await this.answers.findOne({ where: { id: saved.id } });
    return { answer: await this.serializeAnswer(row!, user.id) };
  }

  // ---- POST /api/qa/answers/:id/vote ----
  async voteAnswer(id: number, user: User) {
    const a = await this.answers.findOne({ where: { id } });
    if (!a) throw new NotFoundException('回答不存在');
    const has = await this.answerVotes.findOne({
      where: { answer_id: a.id, user_id: user.id },
    });
    if (has) {
      await this.answerVotes.delete({ answer_id: a.id, user_id: user.id });
      await this.answers
        .query(
          'UPDATE answers SET vote_count = GREATEST(0, vote_count - 1) WHERE id = ?',
          [a.id],
        )
        .catch(() =>
          this.answers.query(
            'UPDATE answers SET vote_count = GREATEST(0, vote_count - 1) WHERE id = $1',
            [a.id],
          ),
        );
      return { voted: false, voteCount: Math.max(0, a.vote_count - 1) };
    }
    await this.answerVotes.insert({ answer_id: a.id, user_id: user.id });
    await this.answers.increment({ id: a.id }, 'vote_count', 1);
    if (a.user_id !== user.id)
      await this.helpers.award(a.user_id, { exp: 1 });
    return { voted: true, voteCount: a.vote_count + 1 };
  }

  // ---- POST /api/qa/:id/accept/:answerId ----
  async accept(id: number, answerId: number, user: User) {
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('问题不存在');
    if (q.user_id !== user.id)
      throw new ForbiddenException('只有提问者可以采纳回答');
    if (q.status === 'solved') throw new BadRequestException('已经采纳过回答了');
    const a = await this.answers.findOne({
      where: { id: answerId, question_id: q.id },
    });
    if (!a) throw new NotFoundException('回答不存在');

    await this.dataSource.transaction(async (mgr) => {
      await mgr.update(Answer, { id: a.id }, { accepted: 1 });
      await mgr.update(
        Question,
        { id: q.id },
        { status: 'solved', best_answer_id: a.id },
      );
      if (q.bounty > 0 && a.user_id !== q.user_id)
        await mgr.increment(User, { id: a.user_id }, 'points', q.bounty);
    });
    await this.helpers.award(a.user_id, { exp: 10 }, 'answer_accepted');
    if (a.user_id !== user.id)
      await this.helpers.notify({
        userId: a.user_id,
        actorId: user.id,
        type: 'accept',
        targetType: 'question',
        targetId: q.id,
        preview:
          q.bounty > 0
            ? `采纳了你的回答，悬赏 ${q.bounty} 积分到账`
            : '采纳了你的回答',
      });
    return { ok: true };
  }

  // ---- GET /api/qa/admin/stats （问答模块运营总览, 管理员）----
  async adminStats(user: User) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const total = await this.questions.count();
    const open = await this.questions.count({ where: { status: 'open' } });
    const solved = await this.questions.count({ where: { status: 'solved' } });
    const totalAnswers = await this.answers.count();
    // 仍在悬赏中的积分总额（未解决问题的 bounty 之和）= 当前被托管的积分
    const escrowRow = await this.questions
      .createQueryBuilder('q')
      .select('COALESCE(SUM(q.bounty), 0)', 'sum')
      .where("q.status = 'open'")
      .getRawOne();
    const openBounty = Number(escrowRow?.sum || 0);
    return { total, open, solved, totalAnswers, openBounty };
  }

  // ---- DELETE /api/qa/:id （管理员删除问题, 连同回答与投票）----
  async adminRemove(user: User, id: number) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const q = await this.questions.findOne({ where: { id } });
    if (!q) throw new NotFoundException('问题不存在');
    const ans = await this.answers.find({ where: { question_id: id } });
    for (const a of ans) await this.answerVotes.delete({ answer_id: a.id });
    await this.answers.delete({ question_id: id });
    await this.questions.delete({ id });
    return { ok: true };
  }
}
