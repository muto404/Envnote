import brandIcon from "../assets/envnote.svg";

export function BrandMark() {
  return <img className="brand-mark" src={brandIcon} alt="" aria-hidden="true" />;
}

export function FileMark() {
  return (
    <span className="file-mark" aria-hidden="true">
      <svg width="26" height="30" viewBox="0 0 26 30" fill="none">
        <path d="M5 1.5h11l8.5 8.5v15a3.5 3.5 0 0 1-3.5 3.5H5A3.5 3.5 0 0 1 1.5 25V5A3.5 3.5 0 0 1 5 1.5Z" fill="currentColor" fillOpacity=".055" stroke="currentColor" />
        <path d="M16 1.5V8a2 2 0 0 0 2 2h6.5M7 16h12M7 21h8" stroke="currentColor" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function EmptyFileArt() {
  return (
    <svg className="empty-file-art" width="184" height="152" viewBox="0 0 184 152" aria-hidden="true" fill="none">
      <path d="M33 131h117M22 137h140" stroke="#e6e2da" strokeLinecap="round" />
      <rect x="56.5" y="17.5" width="93" height="112" rx="10" fill="#eeece7" stroke="#dedbd3" transform="rotate(10 56.5 17.5)" />
      <path d="M47.5 8.5h62L139.5 38v86a10 10 0 0 1-10 10h-82a10 10 0 0 1-10-10v-106a10 10 0 0 1 10-10Z" fill="#fffdf9" stroke="#d7d4cc" />
      <path d="M109.5 8.5V30a8 8 0 0 0 8 8h22" fill="#f3f1ec" stroke="#d7d4cc" strokeLinejoin="round" />
      <text x="53" y="45" className="art-file-label">.env</text>
      <path d="M53 61h70M53 83h70M53 104h70" stroke="#e9e5de" />
      <path d="M55 72h23m8 0h3m-34 22h18m8 0h3m-29 21h32" stroke="#a6a5a0" strokeWidth="2" strokeLinecap="round" />
      <path d="M99 72h1m6 0h1m6 0h1m6 0h1m-27 22h1m6 0h1m6 0h1m6 0h1" stroke="#68635a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
