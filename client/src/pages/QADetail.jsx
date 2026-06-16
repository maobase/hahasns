import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardBody, Button, Spinner, Chip } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import { UserName } from '../components/Identity';
import { Empty } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum, timeAgo } from '../lib/format';

function AnswerCard({ answer, question, onVote, onAccept, canAccept }) {
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
        <div className="answer-content"><RichText text={answer.content} /></div>
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
  const { id } = useParams();
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [question, setQuestion] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setQuestion(null); setNotFound(false);
    api.get(`/qa/${id}`)
      .then(({ data }) => { setQuestion(data.question); setAnswers(data.answers); })
      .catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const submitAnswer = async () => {
    if (!user) return setAuthOpen(true);
    if (!reply.trim()) return toast.err('回答内容不能为空');
    setBusy(true);
    try {
      const { data } = await api.post(`/qa/${id}/answers`, { content: reply });
      setAnswers((prev) => [...prev, data.answer]);
      setQuestion((q) => ({ ...q, answerCount: q.answerCount + 1 }));
      setReply('');
      toast.ok('回答已发布');
    } catch (err) { toast.err(err.message); }
    finally { setBusy(false); }
  };

  const voteAnswer = async (a) => {
    if (!user) return setAuthOpen(true);
    try {
      const { data } = await api.post(`/qa/answers/${a.id}/vote`);
      setAnswers((prev) => prev.map((x) => x.id === a.id ? { ...x, voted: data.voted, voteCount: data.voteCount } : x));
    } catch (err) { toast.err(err.message); }
  };

  const acceptAnswer = async (a) => {
    try {
      await api.post(`/qa/${id}/accept/${a.id}`);
      setAnswers((prev) => prev.map((x) => ({ ...x, accepted: x.id === a.id }))
        .sort((p, q2) => (q2.accepted - p.accepted) || (q2.voteCount - p.voteCount)));
      setQuestion((q) => ({ ...q, status: 'solved', bestAnswerId: a.id }));
      toast.ok('已采纳该回答');
    } catch (err) { toast.err(err.message); }
  };

  if (notFound) return <Shell><div className="card"><Empty icon="🔍" text="问题不存在或已删除" /></div></Shell>;
  if (!question) return <Shell><div className="flex justify-center py-10"><Spinner color="primary" /></div></Shell>;

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
          {question.body && <div className="qa-d-body"><RichText text={question.body} /></div>}
        </CardBody>
      </Card>

      <div className="qa-answers-head">
        <Icon name="comment" size={16} /> {fmtNum(question.answerCount)} 个回答
      </div>

      {answers.length === 0 ? (
        <div className="card"><Empty icon="💡" text="还没有人回答，来贡献第一个答案吧" /></div>
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
          {user ? (
            <>
              <textarea className="qa-answer-input" value={reply} onChange={(e) => setReply(e.target.value)}
                placeholder="分享你的见解，帮 TA 解决问题…" maxLength={2000} rows={4} />
              <div className="flex justify-end">
                <Button color="primary" isLoading={busy} onPress={submitAnswer} isDisabled={!reply.trim()}>发布回答</Button>
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
