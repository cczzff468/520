/**
 * AppleAI Web — 仿iOS AI聊天系统
 * 核心应用为纯原生 HTML/CSS/JS（public/ios/），Next.js 仅作承载壳。
 */
export default function Home() {
  return (
    <iframe
      id="ios-frame"
      name="ios-frame"
      src="/ios/index.html"
      title="AppleAI Web"
      allow="camera; microphone; geolocation; fullscreen; autoplay; clipboard-read; clipboard-write; encrypted-media"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'block',
        background: '#000',
      }}
    />
  );
}
