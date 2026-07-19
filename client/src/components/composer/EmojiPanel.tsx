// 表情面板：emoji 网格 + 选择回调。插入与 textarea 焦点逻辑留在 Composer（onPick 回调）。
const EMOJIS = '😀 😂 🥰 😍 😎 🤔 😴 😭 😡 👍 👏 🙏 💪 🎉 🔥 ✨ 💯 ❤️ 💔 🌈 ☕ 🍜 🎵 📷 🌙 ⭐ 🐱 🐶 🌸 🍀 🚀 💎'.split(' ');

export default function EmojiPanel({ onPick }: { onPick: (em: string) => void }) {
  return (
    <div className="emoji-pop">
      {EMOJIS.map((em) => <button key={em} onClick={() => onPick(em)}>{em}</button>)}
    </div>
  );
}
