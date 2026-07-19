import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input, Textarea, Select, SelectItem, Button } from '../components/heroui';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Badges } from '../components/Identity';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLayout } from '../context/SiteContext';
import api from '../api/client';
import { shrinkImage } from '../lib/resizeImage';

const EMOJIS = '🦊 🐼 🐯 🦁 🐸 🐙 🦄 🐧 🐳 🦉 🐝 🦋 🐱 🐶 🐰 🐻 🐨 🐵'.split(' ');
const COLORS = ['#7c5cff', '#22b8cf', '#ff922b', '#f06595', '#4c6ef5', '#20c997', '#fab005', '#e8590c', '#15aabf', '#cc5de8'];

// Gate so the form only mounts once `user` is loaded (avoids empty-field init on hard reload)
export default function Settings() {
  const { user, loading, setAuthOpen } = useAuth();
  const layout = useLayout('settings', 'narrow');
  if (loading) return <Shell layout={layout}><Loading /></Shell>;
  if (!user) { setAuthOpen(true); return <Shell layout={layout}><div className="ui-card"><Empty icon="🔒" text="登录后编辑资料" /></div></Shell>; }
  return <SettingsForm />;
}

function SettingsForm() {
  const { user, patchUser } = useAuth();
  const toast = useToast();
  const layout = useLayout('settings', 'narrow');
  const nav = useNavigate();
  const avatarFile = useRef<HTMLInputElement | null>(null);
  const coverFile = useRef<HTMLInputElement | null>(null);

  const isEmojiAvatar = user?.avatar?.startsWith('emoji:');
  const [form, setForm] = useState(() => ({
    nickname: user?.nickname || '', bio: user?.bio?.startsWith('emoji:') ? '' : (user?.bio || ''),
    gender: user?.gender || 'secret', location: user?.location || '',
  }));
  const [mode, setMode] = useState(isEmojiAvatar ? 'emoji' : 'image');
  const [avatarUrl, setAvatarUrl] = useState<any>(isEmojiAvatar ? null : user?.avatar || null);
  const [coverUrl, setCoverUrl] = useState<any>(user?.cover && !user.cover.startsWith('emoji') ? user.cover : null);
  const [emoji, setEmoji] = useState(() => {
    const a = isEmojiAvatar ? user!.avatar!.split(':') : [];
    return { e: a[1] || '🦊', c: a[2] || '#7c5cff' };
  });
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ old: '', next: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [inv, setInv] = useState<any>({});
  const [newName, setNewName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);

  useEffect(() => {
    api.get('/users/me/blocks').then(({ data }) => setBlocks(data.users)).catch(() => {});
    api.get('/mall/inventory').then(({ data }) => setInv(data.inventory)).catch(() => {});
  }, []);

  const changeUsername = async () => {
    setNameBusy(true);
    try {
      const { data } = await api.post('/auth/change-username', { username: newName.trim() });
      patchUser(data.user); setNewName('');
      setInv((v: any) => ({ ...v, rename: Math.max(0, (v.rename || 1) - 1) }));
      toast.ok('用户名已修改 🎉');
    } catch (e: any) { toast.err(e.message); }
    finally { setNameBusy(false); }
  };
  const unblock = async (u: any) => {
    try { await api.post(`/users/${u.id}/block`); setBlocks((b) => b.filter((x) => x.id !== u.id)); toast.ok(`已将 ${u.nickname} 移出黑名单`); }
    catch (e: any) { toast.err(e.message); }
  };

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const changePassword = async () => {
    setPwBusy(true);
    try { await api.post('/auth/password', { oldPassword: pw.old, newPassword: pw.next }); setPw({ old: '', next: '' }); toast.ok('密码已修改'); }
    catch (e: any) { toast.err(e.message); }
    finally { setPwBusy(false); }
  };

  const upload = (kind: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    if (!raw) return;
    const file = await shrinkImage(raw, kind === 'avatar' ? 512 : 1600); // 头像显示很小，缩到 512 足够
    const fd = new FormData(); fd.append('files', file);
    try {
      const { data } = await api.post('/upload', fd);
      const url = data.files[0]?.url;
      if (kind === 'avatar') { setAvatarUrl(url); setMode('image'); }
      else setCoverUrl(url);
    } catch (err: any) { toast.err(err.message); }
    e.target.value = '';
  };

  const effectiveAvatar = mode === 'emoji' ? `emoji:${emoji.e}:${emoji.c}` : (avatarUrl || user!.avatar);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put('/users/me/profile', { ...form, avatar: effectiveAvatar, cover: coverUrl || undefined });
      patchUser(data.user);
      toast.ok('资料已更新');
      nav(`/u/${user!.username}`);
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  };

  const previewUser = { ...user, ...form, avatar: effectiveAvatar };

  return (
    <Shell layout={layout}>
      <div className="ui-card page-title">
        <button className="back-btn" onClick={() => nav(-1)} aria-label="返回"><Icon name="back" size={20} /></button>
        编辑资料
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        {/* cover + avatar preview, like the real profile header */}
        <div className="profile-cover" style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}}>
          <button className="cover-upload" onClick={() => coverFile.current?.click()}><Icon name="image" size={15} /> 更换封面</button>
        </div>
        <div style={{ padding: '0 22px 20px' }}>
          <div className="row" style={{ marginTop: -36, alignItems: 'flex-end', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <Avatar user={previewUser} size={84} />
              <button className="avatar-upload" onClick={() => avatarFile.current?.click()} aria-label="上传头像"><Icon name="image" size={14} /></button>
            </div>
            <Button size="sm" variant="bordered" className="haha-btn-app" onClick={() => avatarFile.current?.click()} style={{ marginBottom: 6 }}><Icon name="image" size={14} style={{ width: 14, height: 14 }} /> 上传头像</Button>
            <Button size="sm" color="primary" variant={mode === 'emoji' ? 'solid' : 'bordered'} className="haha-btn-app" onClick={() => setMode(mode === 'emoji' ? 'image' : 'emoji')} style={{ marginBottom: 6 }}>表情头像</Button>
          </div>

          {mode === 'emoji' && (
            <div style={{ marginTop: 14 }}>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => setEmoji((s) => ({ ...s, e }))}
                    className="center" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 21, background: emoji.e === e ? 'var(--brand-soft)' : 'var(--surface-2)', outline: emoji.e === e ? '2px solid var(--brand)' : 'none' }}>{e}</button>
                ))}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setEmoji((s) => ({ ...s, c }))}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, outline: emoji.c === c ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }} />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-5" style={{ marginTop: 20 }}>
            <Input label="昵称" labelPlacement="outside" variant="bordered" radius="md" value={form.nickname} onChange={set('nickname')} maxLength={20} />
            <Textarea label="个性签名" labelPlacement="outside" variant="bordered" radius="md" value={form.bio} onChange={set('bio')} placeholder="介绍一下自己吧" maxLength={120} minRows={3} />
            <div className="flex gap-3">
              <Select label="性别" labelPlacement="outside" variant="bordered" radius="md" className="flex-1" selectedKeys={[form.gender]} onChange={set('gender')}>
                <SelectItem key="secret">保密</SelectItem>
                <SelectItem key="male">男</SelectItem>
                <SelectItem key="female">女</SelectItem>
              </Select>
              <Input label="所在城市" labelPlacement="outside" variant="bordered" radius="md" className="flex-1" value={form.location} onChange={set('location')} placeholder="如：上海" />
            </div>
            <Button color="primary" size="lg" fullWidth isLoading={busy} onPress={save}>保存修改</Button>
          </div>
        </div>
      </div>

      <div className="ui-card" style={{ padding: 22, marginTop: 'var(--gap)' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="shield" size={17} style={{ color: 'var(--brand)' }} /> 账号安全</div>
        <div className="flex flex-col gap-4">
          <Input type="password" label="原密码" labelPlacement="outside" variant="bordered" radius="md" value={pw.old} onChange={(e: any) => setPw((s) => ({ ...s, old: e.target.value }))} placeholder="输入当前密码" />
          <Input type="password" label="新密码" labelPlacement="outside" variant="bordered" radius="md" value={pw.next} onChange={(e: any) => setPw((s) => ({ ...s, next: e.target.value }))} placeholder="至少 6 位" />
          <Button variant="bordered" size="lg" fullWidth isLoading={pwBusy} isDisabled={!pw.old || pw.next.length < 6} onPress={changePassword}>修改密码</Button>
        </div>
        {inv.rename > 0 && (
          <div className="flex flex-col gap-4" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <Input label={`修改用户名 · 持有 ${inv.rename} 张改名卡`} labelPlacement="outside" variant="bordered" radius="md" value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder={`当前 @${user!.username}，输入新用户名`} maxLength={20} />
            <Button variant="bordered" size="lg" fullWidth isLoading={nameBusy} isDisabled={newName.trim().length < 2} onPress={changeUsername}>使用改名卡修改用户名</Button>
          </div>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="ui-card" style={{ padding: '14px 22px 18px', marginTop: 'var(--gap)' }}>
          <div style={{ fontWeight: 800, fontSize: 16, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="ban" size={17} style={{ color: 'var(--like)' }} /> 黑名单</div>
          {blocks.map((u) => (
            <div className="user-row" key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
              <Avatar user={u} size={42} showV />
              <div className="meta nowrap"><Link to={`/u/${u.username}`} className="nm uname">{u.nickname} <Badges user={u} showLevel={false} /></Link><div className="sub nowrap">@{u.username}</div></div>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => unblock(u)}>解除拉黑</Button>
            </div>
          ))}
        </div>
      )}

      <input ref={avatarFile} type="file" accept="image/*" hidden onChange={upload('avatar')} />
      <input ref={coverFile} type="file" accept="image/*" hidden onChange={upload('cover')} />
    </Shell>
  );
}
