import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Spinner, Chip } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import Composer from '../components/Composer';
import PostCard from '../components/PostCard';
import { PostSkeleton, Empty } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';

const CAT_COLOR = { 兴趣: 'secondary', 科技: 'primary', 生活: 'warning', 创作: 'danger', 同城: 'success' };

function CircleMembers({ members }) {
  if (!members?.length) return null;
  return (
    <div className="card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="users" size={16} className="tk" /> 圈子成员</div></div>
      <div className="circle-members">
        {members.map((m) => (
          <Link key={m.id} to={`/u/${m.username}`} className="circle-member" title={m.nickname}>
            <Avatar user={m} size={38} showV />
            <span className="cm-name">{m.nickname}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function CircleDetail() {
  const { slug } = useParams();
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [circle, setCircle] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    setCircle(null); setNotFound(false);
    api.get(`/circles/${encodeURIComponent(slug)}`)
      .then(({ data }) => { setCircle(data.circle); setMembers(data.members); })
      .catch(() => setNotFound(true));
    setPosts(null);
    api.get(`/circles/${encodeURIComponent(slug)}/posts`)
      .then(({ data }) => setPosts(data.posts)).catch(() => setPosts([]));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!user) return setAuthOpen(true);
    setBusy(true);
    try {
      const { data } = await api.post(`/circles/${circle.id}/${circle.joined ? 'leave' : 'join'}`);
      setCircle((c) => ({ ...c, joined: data.joined, memberCount: data.memberCount }));
    } catch (err) { toast.err(err.message); }
    finally { setBusy(false); }
  };

  if (notFound) return <Shell><div className="card"><Empty icon="🧭" text="圈子不存在，它可能已被解散" /></div></Shell>;
  if (!circle) return <Shell><div className="flex justify-center py-10"><Spinner color="primary" /></div></Shell>;

  const color = circle.color || '#2b54f0';

  return (
    <Shell right={<><CircleMembers members={members} /><CircleAbout circle={circle} /></>}>
      <Card shadow="sm" radius="lg" className="mb-4 overflow-hidden border border-default-200">
        <div className="circle-cover" style={{ '--cc': color }} />
        <CardBody className="circle-head">
          <span className="circle-ico circle-ico-xl" style={{ '--cc': color }}><Icon name={circle.icon || 'circle'} size={32} /></span>
          <div className="grow min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold">{circle.name}</h1>
              <Chip size="sm" variant="flat" color={CAT_COLOR[circle.category] || 'default'}>{circle.category}</Chip>
            </div>
            <div className="text-default-500 text-[13px] mt-1.5">
              <b className="text-foreground">{fmtNum(circle.memberCount)}</b> 成员 ·{' '}
              <b className="text-foreground">{fmtNum(circle.postCount)}</b> 动态
              {circle.owner && <> · 圈主 <Link to={`/u/${circle.owner.username}`} className="text-primary">{circle.owner.nickname}</Link></>}
            </div>
            {circle.description && <p className="text-default-600 text-[13.5px] leading-relaxed mt-2">{circle.description}</p>}
          </div>
          <Button color="primary" radius="full" variant={circle.joined ? 'bordered' : 'solid'}
            isLoading={busy} onPress={toggle} className="self-start shrink-0">
            {circle.joined ? '已加入' : '加入圈子'}
          </Button>
        </CardBody>
      </Card>

      {circle.joined && (
        <div className="mb-4">
          <Composer circleId={circle.id} placeholder={`在「${circle.name}」分享点什么…`}
            onPosted={(p) => { setPosts((prev) => [p, ...(prev || [])]); setCircle((c) => ({ ...c, postCount: c.postCount + 1 })); }} />
        </div>
      )}

      {posts === null ? (
        <>{[1, 2].map((i) => <PostSkeleton key={i} />)}</>
      ) : posts.length === 0 ? (
        <div className="card"><Empty icon="✍️" text={circle.joined ? '圈子里还很安静，发布第一条动态吧' : '圈子里还很安静，加入后一起开聊'} /></div>
      ) : (
        <div className="feed">
          {posts.map((p) => <PostCard key={p.id} post={p} onDelete={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))} />)}
        </div>
      )}
    </Shell>
  );
}

function CircleAbout({ circle }) {
  return (
    <div className="card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="compass" size={15} className="tk" /> 关于圈子</div></div>
      <p className="text-default-600 text-[13px] leading-relaxed px-1 pb-1">
        {circle.description || '这个圈子还没有简介。'}
      </p>
      <div className="circle-about-meta">
        <span><Icon name="users" size={14} /> {fmtNum(circle.memberCount)} 成员</span>
        <span><Icon name="edit" size={14} /> {fmtNum(circle.postCount)} 动态</span>
      </div>
    </div>
  );
}
