import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardBody, Button, Chip } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import RichBody from '../components/RichBody';
import MarkdownToolbar from '../components/MarkdownToolbar';
import { UserName } from '../components/Identity';
import { Empty, DetailSkeleton, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum, timeAgo } from '../lib/format';
import { loadDraft, saveDraft, clearDraft } from '../lib/draft';
import { usePageTitle } from '../hooks/usePageTitle';

function AnswerCard({ answer, question, onVote, onAccept, canAccept }: { answer: any; question: any; onVote: (a: any) => void; onAccept: (a: any) => void; canAccept: boolean }) {
  return (
    <div className={`answer${answer.accepted ? ' accepted' : ''}`}>
      <div className="answer-vote">
        <button className={`av-btn${answer.voted ? ' on' : ''}`} onClick={() => onVote(answer)} title="赞同">
          <Icon name="arrowUp" size={18} />
        </button>
        <b className="av-count">{fmtNum(answer.voteCount)}</b>
      </div>
      <div className="answer-body">
        {answer.accepted && <div className="answer-badge"><Icon name="check" size={13} /> 已采纳{question.bounty > 0 ? ` · 悬赏 ${question.bounty} 积分` : ''}</div>}
        <div className="answer-content"><RichBody text={answer.content} /></div>
        <div className="answer-foot">
          <Avatar user={answer.author} size={24} showV />
          <Link to={`/u/${answer.author.username}`} className="answer-author"><UserName user={answer.author} /></Link>
          <span className="qa-dot">·</span>
          <span className="answer-time">{timeAgo(answer.createdAt)}</span>
          {canAccept && !answer.accepted && (
            <Button size="sm" variant="flat" color="success" className="ml-auto" onPress={() => onAccept(answer)}>采纳</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QADetail() {
  const { id } = useParams<{ id: string }>();
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [question, setQuestion] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const answerTaRef = useRef<HTMLTextAreaElement | null>(null);
  const [ansPreview, setAnsPreview] = useState(false);
  const [restored, setRestored] = useState(false);
  usePageTitle(question?.title); // 标签页显示问题真实标题（覆盖通用「问题详情」）

  // 回答草稿（spec 01 §2.4 草稿推广）：按问题 id 独立存槽，写一半刷新/离开再回来自动恢复。
  // 恢复只依赖 [id]；自动存只依赖 [reply] —— 切问题时 reply 尚未变，不会把上一题的回答误存到新题。
  useEffect(() => {
    const d = loadDraft(`answer_${id}`);
    if (d?.content?.trim()) { setReply(d.content); setRestored(true); } else { setReply(''); setRestored(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    saveDraft({ content: reply }, `answer_${id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply]);

  const load = useCallback(() => {
    setQuestion(null); setNotFound(false); setError(false);
    api.get(`/qa/${id}`)
      .then(({ data }) => { setQuestion(data.question); setAnswers(data.answers); })
      .catch((e: any) => { if (e?.status === 404) setNotFound(true); else setError(true); });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submitAnswer = async () => {
    if (!user) return setAuthOpen(true);
    if (!reply.trim()) return toast.err('回答内容不能为空');
    setBusy(true);
    try {
      const { data } = await api.post(`/qa/${id}/answers`, { content: reply });
      setAnswers((prev) => [...prev, data.answer]);
      setQuestion((q: any) => ({ ...q, answerCount: q.answerCount + 1 }));
      setReply(''); clearDraft(`answer_${id}`); setRestored(false);
      toast.ok('回答已发布');
    } catch (err: any) { toast.err(err.message); }
    finally { setBusy(false); }
  };

  const voteAnswer = async (a: any) => {
    if (!user) return setAuthOpen(true);
    try {
      const { data } = await api.post(`/qa/answers/${a.id}/vote`);
      setAnswers((prev) => prev.map((x) => x.id === a.id ? { ...x, voted: data.voted, voteCount: data.voteCount } : x));
    } catch (err: any) { toast.err(err.message); }
  };

  const acceptAnswer = async (a: any) => {
    try {
      await api.post(`/qa/${id}/accept/${a.id}`);
      setAnswers((prev) => prev.map((x) => ({ ...x, accepted: x.id === a.id }))
        .sort((p, q2) => (q2.accepted - p.accepted) || (q2.voteCount - p.voteCount)));
      setQuestion((q: any) => ({ ...q, status: 'solved', bestAnswerId: a.id }));
      toast.ok('已采纳该回答');
    } catch (err: any) { toast.err(err.message); }
  };

  if (error) return <Shell><div className="ui-card"><LoadError onRetry={load} /></div></Shell>;
  if (notFound) return <Shell><div className="ui-card"><Empty icon="🔍" text="问题不存在或已删除" /></div></Shell>;
  if (!question) return <Shell><DetailSkeleton /></Shell>;

  const canAccept = question.isAsker && question.status !== 'solved';

  return (
    <Shell>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200">
        <CardBody className="gap-3">
          <div className="qa-d-head">
            <h1 className="qa-d-title">{question.title}</h1>
            {question.bounty > 0 && (
              <div className={`qa-bounty lg${question.status === 'solved' ? ' done' : ''}`}>
                <Icon name="coin" size={16} /> {question.bounty}
              </div>
            )}
          </div>
          <div className="qa-d-meta">
            <Chip size="sm" variant="flat">{question.category}</Chip>
            {question.status === 'solved'
              ? <Chip size="sm" variant="flat" color="success" startContent={<Icon name="check" size={12} className="ml-1" />}>已解决</Chip>
              : <Chip size="sm" variant="flat" color="warning">待解决</Chip>}
            <Avatar user={question.author} size={22} showV />
            <Link to={`/u/${question.author.username}`} className="qa-author"><UserName user={question.author} /></Link>
            <span className="qa-dot">·</span>
            <span>{timeAgo(question.createdAt)}</span>
            <span className="qa-dot">·</span>
            <span>{fmtNum(question.viewCount)} 浏览</span>
          </div>
          {question.body && <div className="qa-d-body"><RichBody text={question.body} /></div>}
        </CardBody>
      </Card>

      <div className="qa-answers-head">
        <Icon name="comment" size={16} /> {fmtNum(question.answerCount)} 个回答
      </div>

      {answers.length === 0 ? (
        <div className="ui-card"><Empty icon="💡" text="还没有人回答，来贡献第一个答案吧" /></div>
      ) : (
        <Card shadow="sm" radius="lg" className="border border-default-200 overflow-hidden mb-4">
          <CardBody className="p-0">
            {answers.map((a) => (
              <AnswerCard key={a.id} answer={a} question={question} canAccept={canAccept}
                onVote={voteAnswer} onAccept={acceptAnswer} />
            ))}
          </CardBody>
        </Card>
      )}

      <Card shadow="sm" radius="lg" className="border border-default-200">
        <CardBody className="gap-3">
          <div className="font-bold text-[15px]">写回答</div>
          {restored && user && <div className="faint" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="clock" size={13} /> 已恢复上次未发布的回答草稿</div>}
          {user ? (
            <>
              <div className="row gap-8" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <MarkdownToolbar taRef={answerTaRef} value={reply} onChange={setReply} />
                <Button type="button" size="sm" variant="flat" className="haha-btn-app" style={{ padding: '3px 12px', fontSize: 12.5, flex: 'none' }} onClick={() => setAnsPreview((p) => !p)}>{ansPreview ? '继续编辑' : '预览'}</Button>
              </div>
              {ansPreview ? (
                <div className="qa-answer-input" style={{ minHeight: 96, overflowY: 'auto' }}>
                  {reply.trim() ? <RichBody text={reply} /> : <span className="faint">这里预览 Markdown 渲染效果…</span>}
                </div>
              ) : (
                <textarea ref={answerTaRef} className="qa-answer-input" value={reply} onChange={(e) => setReply(e.target.value)}
                  placeholder="分享你的见解，帮 TA 解决问题…支持 Markdown（标题 / 列表 / 引用 / 代码 / 链接）" maxLength={2000} rows={4} />
              )}
              <div className="flex justify-end">
                <Button color="primary" isDisabled={busy || !reply.trim()} onPress={submitAnswer}>{busy ? '发布中…' : '发布回答'}</Button>
              </div>
            </>
          ) : (
            <Button color="primary" variant="flat" onPress={() => setAuthOpen(true)}>登录后回答</Button>
          )}
        </CardBody>
      </Card>
    </Shell>
  );
}
