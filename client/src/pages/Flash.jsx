import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Chip, Tabs, Tab, Spinner } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import api from '../api/client';
import { timeAgo } from '../lib/format';

const CATS = ['全部', '公告', '功能', '活动', '精选', '教程'];
const CAT_COLOR = { 公告: 'danger', 功能: 'primary', 活动: 'warning', 精选: 'secondary', 教程: 'success', 动态: 'default' };

export default function Flash() {
  const [cat, setCat] = useState('全部');
  const [list, setList] = useState(null);

  useEffect(() => {
    let alive = true;
    setList(null);
    const params = cat === '全部' ? {} : { category: cat };
    api.get('/flash', { params }).then(({ data }) => { if (alive) setList(data.flash); }).catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [cat]);

  return (
    <Shell>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200">
        <CardBody>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="bell" size={21} style={{ color: 'var(--brand)' }} /> 资讯快报
          </h1>
          <p className="text-default-500 text-small mt-1">社区动态、功能上新、活动与精选，一眼看全。</p>
        </CardBody>
      </Card>

      <Tabs aria-label="快报分类" color="primary" variant="solid" radius="lg" fullWidth
        selectedKey={cat} onSelectionChange={(k) => setCat(k)} className="mb-3">
        {CATS.map((c) => <Tab key={c} title={c} />)}
      </Tabs>

      {list === null ? (
        <div className="flex justify-center py-10"><Spinner color="primary" /></div>
      ) : list.length === 0 ? (
        <Card shadow="sm" radius="lg"><CardBody className="text-center text-default-400 py-8 text-small">暂无快报</CardBody></Card>
      ) : (
        <Card shadow="sm" radius="lg" className="border border-default-200 overflow-hidden">
          <CardBody className="p-0">
            {list.map((f) => {
              const Row = f.url ? 'a' : 'div';
              return (
                <Row key={f.id} className="flash-row" {...(f.url ? { href: f.url, target: '_blank', rel: 'noreferrer' } : {})}>
                  <Chip size="sm" variant="flat" color={CAT_COLOR[f.category] || 'default'} className="shrink-0">{f.category}</Chip>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="flash-title">
                      {!!f.pinned && <Icon name="pin" size={12} style={{ color: 'var(--brand)', verticalAlign: '-1px', marginRight: 4 }} />}
                      {f.title}
                    </div>
                    {f.summary && <div className="flash-sum">{f.summary}</div>}
                  </div>
                  <span className="flash-time">{timeAgo(f.createdAt)}</span>
                </Row>
              );
            })}
          </CardBody>
        </Card>
      )}
    </Shell>
  );
}
