import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, Tabs, Tab, Spinner } from '../components/heroui';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Badges } from '../components/Identity';
import api from '../api/client';
import { fmtNum } from '../lib/format';

const BOARDS = [
  { key: 'wealth', title: '财富榜', metric: (u) => `${fmtNum(u.points || 0)}`, unit: '积分' },
  { key: 'level', title: '等级榜', metric: (u) => `Lv.${u.level}`, unit: '' },
  { key: 'fans', title: '人气榜', metric: (u) => `${fmtNum(u.followers || 0)}`, unit: '粉丝' },
  { key: 'checkin', title: '签到榜', metric: (u) => `${u.checkinStreak || 0}`, unit: '天' },
];

export default function Leaderboard() {
  const [type, setType] = useState('wealth');
  const [users, setUsers] = useState(null);

  useEffect(() => {
    let alive = true;
    setUsers(null);
    api.get(`/users/ranking/${type}`).then(({ data }) => { if (alive) setUsers(data.users); }).catch(() => alive && setUsers([]));
    return () => { alive = false; };
  }, [type]);

  const board = BOARDS.find((b) => b.key === type);

  return (
    <Shell right={false}>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200">
        <CardBody>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="trend" size={22} style={{ color: 'var(--gold)' }} /> 排行榜
          </h1>
          <p className="text-default-500 text-small mt-1">看看社区里最活跃、最有人气的小伙伴们。</p>
        </CardBody>
      </Card>

      <Tabs aria-label="排行榜" color="primary" variant="solid" radius="lg" fullWidth
        selectedKey={type} onSelectionChange={(k) => setType(k)} className="mb-3">
        {BOARDS.map((b) => <Tab key={b.key} title={b.title} />)}
      </Tabs>

      {users === null ? (
        <div className="flex justify-center py-10"><Spinner color="primary" /></div>
      ) : users.length === 0 ? (
        <Card shadow="sm" radius="lg"><CardBody className="text-center text-default-400 py-8">暂无数据</CardBody></Card>
      ) : (
        <Card shadow="sm" radius="lg" className="border border-default-200 overflow-hidden">
          <CardBody className="p-0">
            {users.map((u, i) => (
              <Link to={`/u/${u.username}`} key={u.id} className="lb-row">
                <span className={`lb-rank${i < 3 ? ` top r${i + 1}` : ''}`}>{i + 1}</span>
                <Avatar user={u} size={42} showV />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="uname" style={{ fontSize: 14.5 }}>{u.nickname} <Badges user={u} showLevel={false} /></div>
                  <div className="faint" style={{ fontSize: 12 }}>@{u.username}</div>
                </div>
                <span className="lb-metric"><b className="num">{board.metric(u)}</b>{board.unit && <span className="lb-unit"> {board.unit}</span>}</span>
              </Link>
            ))}
          </CardBody>
        </Card>
      )}
    </Shell>
  );
}
