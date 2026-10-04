import React, { useState } from 'react';

interface TourHandbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartInteractiveSandbox: () => void;
}

type GuideTopic = 'group' | 'parent' | 'wiring' | 'layout' | 'pins' | 'piemenu';

interface TopicDetail {
  id: GuideTopic;
  title: string;
  badge: string;
  keys: string[];
  summary: string;
  bullets: string[];
}

const TOPICS: TopicDetail[] = [
  {
    id: 'group',
    title: '框选打组与折叠',
    badge: 'GROUP',
    keys: ['Ctrl + G 打组', 'Ctrl + Shift + G 解散', '拖入卡片自动入组'],
    summary: '外层 Group 将多张卡片打包管理，自动生成紧凑多边形虚线轮廓，可随整组缩放并一键折叠。',
    bullets: [
      '框选多张卡片后按 Ctrl+G，打包为独立 Group；',
      '将组外卡片中心拖入凸包虚线轮廓内，松手即可自动入组；',
      '点击轮廓左上角方形按钮收起为紧凑列表（最多显示9行，内部滚动）；',
      '选中组后拖拽四角缩放点，组内所有卡片及文字等比整体缩放。',
    ],
  },
  {
    id: 'parent',
    title: '圆形父物体与联动',
    badge: 'PARENT',
    keys: ['Ctrl + J 创建/绑定父级', 'Ctrl 拖拽只动当前'],
    summary: '120px 标准圆形父物体是树形拓扑的枢纽，用于建立主题中心并实现分支级位移联动。',
    bullets: [
      '选中卡片后按 Ctrl+J 在光标处创建父物体，并将选中的卡片或 Group 自动挂接到其下方；',
      '普通拖拽父物体时，下级所有有效关联卡片和 Group 同步位移；',
      '按住 Ctrl 拖拽则只移动当前节点，不带动下级分支；',
      '右键父物体呼出轮盘，左内圈 180° 渐变色环可快速点击或拖拽切换主题色。',
    ],
  },
  {
    id: 'wiring',
    title: '交互引线连接与断开',
    badge: 'WIRING',
    keys: ['Ctrl + Shift + 拖拽 连线', 'Ctrl + Shift + 单击 断开'],
    summary: '无需打开复杂菜单，任意对象之间直接从边缘拉出引线即可建立层级连接。',
    bullets: [
      '按住 Ctrl+Shift 从卡片、Group 或父物体的边界拖出引线；',
      '对准目标松开，即建立唯一的父子上下级关系；',
      '按住 Ctrl+Shift 直接单击已有连线的对象，即可秒级切断上级连接；',
      '系统内置成环检测，自动拒绝循环连接。',
    ],
  },
  {
    id: 'layout',
    title: '自动排版与避障对齐',
    badge: 'LAYOUT',
    keys: ['Ctrl + P 分行装箱', 'Alt + 方向键 5px 避障对齐', '统一宽度'],
    summary: '告别杂乱堆叠，提供分行自动装箱排版与带有精确物理间隙的 4 向方向对齐。',
    bullets: [
      '选中卡片（未选中时为全部）按 Ctrl+P，按现有顺序紧凑分行装箱自动排版；',
      '按 Alt+方向键（上下左右），以 5px 安全避障间隙将移动对象整齐排列至障碍物侧面；',
      '空白右键轮盘选择“均宽”，一次性求所选卡片平均宽度并水平居中统一，高度保持不变。',
    ],
  },
  {
    id: 'pins',
    title: '空间图钉与飞行动画',
    badge: 'PINS',
    keys: ['Ctrl + 1 ~ 8 快速穿梭', '右键/拖拽 图钉'],
    summary: '在广袤无限画布上标记空间锚点，280ms 平滑缓动飞行动画瞬时穿梭，永不迷失。',
    bullets: [
      '空白处右键选择“图钉”，单键 1~8 快速在当前世界坐标固定一枚墨黑内凹倒角十字星图钉；',
      '全局按下 Ctrl+1~8，视口以 280ms cubic 缓动平滑飞行居中到目标图钉；',
      '图钉支持鼠标左键按住自由拖拽微调位置，悬停触发弹跳微动效；',
      '右键图钉或悬停右上角 ✕ 即可移除。',
    ],
  },
  {
    id: 'piemenu',
    title: '极速右键命令轮盘',
    badge: 'PIE MENU',
    keys: ['空白右键 9 扇区', '对象右键 12 钟面'],
    summary: '手势驱动的扇区命令轮盘，划动超过 18px 松手立即执行，比传统右键菜单快数倍。',
    bullets: [
      '空白处右键按下立即弹出：便签、父级、成组、图钉、搜索、复制、粘贴、全览、均宽；',
      '卡片右键：1点标题、2点时间、3点NOW、4点复位、5点解析、6点解组、8点断线、9点标签、10点识字、11点溯源；',
      '轻点松开保留菜单可左键点击，按住向目标方向划动松开直接触发，零等待。',
    ],
  },
];

export const TourHandbookModal: React.FC<TourHandbookModalProps> = ({
  isOpen,
  onClose,
  onStartInteractiveSandbox,
}) => {
  const [activeTopicId, setActiveTopicId] = useState<GuideTopic>('group');

  if (!isOpen) return null;

  const currentTopic = TOPICS.find((t) => t.id === activeTopicId) || TOPICS[0];

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-ink/30 select-none animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-[760px] max-w-[95vw] h-[540px] max-h-[90vh] bg-paper text-ink border-2 border-ink flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-ink bg-paper flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-black tracking-tight font-retina">核心操作与功能教程</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.05em] text-ink/50 bg-stone/30 px-2 py-0.5 rounded-[10px]">
              Core Guide
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onStartInteractiveSandbox();
              }}
              className="px-3 py-1 text-[12px] font-bold bg-ink text-paper rounded-[10px] hover:bg-ink/80 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>✦</span>
              <span>进入画布实操演练</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center border border-ink/40 text-ink/70 hover:text-ink hover:border-ink rounded-[10px] text-sm cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Topic List */}
          <div className="w-[200px] border-r-2 border-ink flex flex-col p-3 gap-1.5 bg-paper flex-shrink-0">
            {TOPICS.map((topic) => {
              const isActive = topic.id === activeTopicId;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => setActiveTopicId(topic.id)}
                  className={`w-full text-left px-3 py-2.5 text-[13px] font-bold transition-colors cursor-pointer rounded-[10px] flex items-center justify-between ${
                    isActive
                      ? 'bg-ink text-paper'
                      : 'text-ink/80 hover:bg-ink/5'
                  }`}
                >
                  <span>{topic.title}</span>
                  <span className={`text-[10px] font-mono ${isActive ? 'text-paper/60' : 'text-ink/40'}`}>
                    {topic.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Topic Visual & Details */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-5">
            {/* Visual Vector Motion Stage */}
            <div className="w-full h-[180px] bg-parchment/40 border border-ink/20 rounded-[10px] flex items-center justify-center relative overflow-hidden select-none">
              {/* Dynamic Vector Canvas Animation per Topic */}
              {currentTopic.id === 'group' && (
                <div className="relative w-full h-full flex items-center justify-center">
                  {/* Outer Bundle Convex Hull Outline */}
                  <div className="w-[240px] h-[120px] border-2 border-dashed border-ink/70 bg-paper/30 flex items-center justify-center relative animate-pulse">
                    <span className="absolute -top-3.5 left-2 bg-paper border border-ink px-1.5 py-0.2 text-[10px] font-bold">
                      Group 容器
                    </span>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-paper border border-ink flex items-center justify-center text-[10px] font-bold shadow-sm">
                        卡片 A
                      </div>
                      <div className="w-16 h-16 bg-paper border border-ink flex items-center justify-center text-[10px] font-bold shadow-sm">
                        卡片 B
                      </div>
                    </div>
                  </div>
                  {/* Incoming Card animation */}
                  <div className="absolute right-6 top-8 w-14 h-14 bg-paper border border-ink/80 flex items-center justify-center text-[10px] font-bold shadow-md animate-bounce">
                    卡片 C
                  </div>
                </div>
              )}

              {currentTopic.id === 'parent' && (
                <div className="relative w-full h-full flex items-center justify-center gap-12">
                  {/* Parent Circle Node */}
                  <div className="w-[84px] h-[84px] rounded-full bg-paper border-2 border-ink flex flex-col items-center justify-center shadow-sm">
                    <span className="text-[11px] font-black">主题父级</span>
                    <span className="text-[9px] text-ink/60 font-mono">120px 正圆</span>
                  </div>
                  {/* Connecting Line */}
                  <div className="w-12 h-0.5 bg-ink relative">
                    <div className="w-2 h-2 rounded-full bg-ink absolute -left-1 -top-[3px]" />
                    <div className="w-2 h-2 rounded-full bg-ink absolute -right-1 -top-[3px]" />
                  </div>
                  {/* Child Card */}
                  <div className="w-20 h-16 bg-paper border border-ink flex items-center justify-center text-[11px] font-bold shadow-sm">
                    关联子便签
                  </div>
                </div>
              )}

              {currentTopic.id === 'wiring' && (
                <div className="relative w-full h-full flex items-center justify-center gap-16">
                  <div className="w-20 h-16 bg-paper border-2 border-ink flex items-center justify-center text-[11px] font-bold">
                    起点对象
                  </div>
                  {/* Interactive Wire SVG with pulse */}
                  <div className="relative flex items-center justify-center">
                    <div className="w-20 h-1 bg-ink animate-pulse" />
                    <span className="absolute -top-5 text-[10px] font-mono bg-paper border border-ink px-1.5 py-0.5 rounded-[10px]">
                      Ctrl+Shift
                    </span>
                  </div>
                  <div className="w-20 h-16 bg-paper border-2 border-ink flex items-center justify-center text-[11px] font-bold">
                    目标对象
                  </div>
                </div>
              )}

              {currentTopic.id === 'layout' && (
                <div className="relative w-full h-full flex items-center justify-center gap-3">
                  <div className="w-16 h-20 bg-paper border border-ink flex items-center justify-center text-[11px] font-bold">
                    便签 1
                  </div>
                  <div className="w-16 h-20 bg-paper border border-ink flex items-center justify-center text-[11px] font-bold">
                    便签 2
                  </div>
                  <div className="w-16 h-20 bg-paper border border-ink flex items-center justify-center text-[11px] font-bold">
                    便签 3
                  </div>
                  <div className="w-16 h-20 bg-paper border border-ink flex items-center justify-center text-[11px] font-bold">
                    便签 4
                  </div>
                </div>
              )}

              {currentTopic.id === 'pins' && (
                <div className="relative w-full h-full flex items-center justify-center gap-10">
                  <div className="relative w-14 h-14 flex items-center justify-center">
                    {/* Filleted Cross Mini SVG */}
                    <svg width="44" height="44" viewBox="0 0 88 88" className="fill-ink">
                      <path d="M 39.5 8.0 L 48.5 8.0 L 48.5 21.5 A 18.0 18.0 0 0 0 66.5 39.5 L 80.0 39.5 L 80.0 48.5 L 66.5 48.5 A 18.0 18.0 0 0 0 48.5 66.5 L 48.5 80.0 L 39.5 80.0 L 39.5 66.5 A 18.0 18.0 0 0 0 21.5 48.5 L 8.0 48.5 L 8.0 39.5 L 21.5 39.5 A 18.0 18.0 0 0 0 39.5 21.5 Z" />
                    </svg>
                    <div className="absolute right-0 bottom-0 w-4 h-4 rounded-full bg-paper border border-ink flex items-center justify-center text-[9px] font-bold font-mono">
                      1
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-start">
                    <span className="text-[12px] font-mono font-bold bg-paper border border-ink px-2 py-0.5 rounded-[10px]">
                      按 Ctrl + 1
                    </span>
                    <span className="text-[11px] text-ink/60">280ms 平滑缓动飞向图钉</span>
                  </div>
                </div>
              )}

              {currentTopic.id === 'piemenu' && (
                <div className="relative w-full h-full flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full border border-ink/40 bg-paper/50 flex items-center justify-center relative">
                    <div className="w-2 h-2 rounded-full bg-ink" />
                    <span className="absolute -top-2 bg-ink text-paper text-[9px] font-bold px-1.5 py-0.2 rounded">
                      标题
                    </span>
                    <span className="absolute -bottom-2 bg-ink text-paper text-[9px] font-bold px-1.5 py-0.2 rounded">
                      解组
                    </span>
                    <span className="absolute -left-3 bg-ink text-paper text-[9px] font-bold px-1.5 py-0.2 rounded">
                      标签
                    </span>
                    <span className="absolute -right-3 bg-ink text-paper text-[9px] font-bold px-1.5 py-0.2 rounded">
                      NOW
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Topic Keys badges */}
            <div className="flex flex-wrap gap-2">
              {currentTopic.keys.map((k) => (
                <span
                  key={k}
                  className="px-2.5 py-1 text-[12px] font-mono font-bold bg-ink text-paper rounded-[10px] select-all"
                >
                  {k}
                </span>
              ))}
            </div>

            {/* Summary */}
            <div className="text-[13px] font-medium text-ink/80 leading-relaxed border-l-2 border-ink pl-3">
              {currentTopic.summary}
            </div>

            {/* Bullets */}
            <div className="flex flex-col gap-2">
              {currentTopic.bullets.map((b, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[13px] text-ink">
                  <span className="text-ink font-bold">•</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t-2 border-ink bg-paper flex items-center justify-between flex-shrink-0">
          <span className="text-[12px] text-ink/50 font-mono">
            提示：随时在空白处按 Ctrl+, 进入设置
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 text-[13px] font-bold bg-ink text-paper rounded-[10px] hover:bg-ink/80 transition-opacity cursor-pointer"
          >
            关闭手册
          </button>
        </div>
      </div>
    </div>
  );
};
