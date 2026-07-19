import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { Button } from './heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';

interface FollowButtonProps {
  user: any;
  size?: string;
  onChange?: (following: boolean) => void;
}

// Reusable follow/unfollow toggle. Hidden for self and logged-out viewers.
export default function FollowButton({ user, size = 'sm', onChange }: FollowButtonProps) {
  const { user: me, setAuthOpen } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState(!!user.isFollowing);
  const busy = useRef(false); // in-flight 标记：忽略请求未完成前的重复点击（防连点竞态）

  useEffect(() => { setFollowing(!!user.isFollowing); }, [user.id, user.isFollowing]);

  if (me && me.id === user.id) return null;

  // 乐观更新：先即时切换 UI（与点赞手感一致），后台请求，失败回滚、与服务端不一致则校正
  const toggle = async (e?: React.MouseEvent) => {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (!me) return setAuthOpen(true);
    if (busy.current) return; // 上一次请求还在飞，忽略这次点击
    busy.current = true;
    const next = !following;
    setFollowing(next);
    onChange?.(next);
    toast.show(next ? `已关注 ${user.nickname}` : '已取消关注');
    try {
      const { data } = await api.post(`/users/${user.id}/follow`);
      if (data.following !== next) { setFollowing(data.following); onChange?.(data.following); }
    } catch (err: any) {
      setFollowing(!next); onChange?.(!next); // 回滚
      toast.err(err.message);
    } finally { busy.current = false; }
  };

  return (
    <Button size={size} variant={following ? 'flat' : 'bordered'} className={`haha-btn-app follow-btn${following ? ' following' : ''}`} onClick={toggle}>
      {following
        ? <><span className="fb-on">已关注</span><span className="fb-off">取消关注</span></>
        : <><Icon name="plus" size={14} style={{ width: 14, height: 14 }} /> 关注</>}
    </Button>
  );
}
