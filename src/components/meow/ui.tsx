import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, LoaderCircle, Lock, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import type { MeowAvatar } from "./data";

export function Bean({ player, size = "md", ring = false, dim = false }: { player: MeowAvatar; size?: "xs" | "sm" | "md" | "lg"; ring?: boolean; dim?: boolean }) {
  const sizes = { xs: "size-8 text-[7px]", sm: "size-10 text-[9px]", md: "size-14 text-xs", lg: "size-24 text-lg" };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.72, y: 8 }}
      animate={{ opacity: dim ? 0.45 : 1, scale: 1, y: 0 }}
      whileHover={{ y: -3, rotate: 2 }}
      transition={{ type: "spring", stiffness: 360, damping: 18 }}
      title={`${player.name} · ${player.personality}`}
      className={`${sizes[size]} ${player.color} ${ring ? "ring-4 ring-white" : ""} ${dim ? "grayscale" : ""} relative grid shrink-0 place-items-center rounded-[45%_45%_48%_48%] border-2 border-white/80 font-bold text-[#604d66] shadow-[0_5px_0_rgba(125,92,121,.12)]`}
    >
      <span className="absolute -top-2 right-0 text-[12px] leading-none">{player.accessory}</span>
      <span className="translate-y-1 whitespace-nowrap">{player.face}</span>
      <span className="absolute -bottom-1 size-2 rounded-full bg-white/70" />
    </motion.div>
  );
}

export function Badge({ children, tone = "pink" }: { children: React.ReactNode; tone?: "pink" | "mint" | "lavender" | "cream" | "grey" }) {
  const colors = {
    pink: "bg-[#ffe1eb] text-[#b04f73]", mint: "bg-[#dcf3e8] text-[#4b8f72]",
    lavender: "bg-[#ece6ff] text-[#6e61a7]", cream: "bg-[#fff2cd] text-[#9a7734]",
    grey: "bg-[#f2edf1] text-[#8f8095]",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${colors[tone]}`}>{children}</span>;
}

export function Button({ children, onClick, variant = "primary", disabled = false, icon: Icon, className = "" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "soft" | "ghost"; disabled?: boolean; icon?: React.ElementType; className?: string }) {
  const variants = {
    primary: "bg-[#ef6d9a] text-white shadow-[0_5px_0_#cf547e] hover:translate-y-0.5 hover:shadow-[0_3px_0_#cf547e]",
    soft: "bg-[#edf8f2] text-[#43866b] shadow-[0_4px_0_#c6e8d6]",
    ghost: "bg-white/80 text-[#74647d] shadow-[0_3px_0_#eadce5]",
  };
  const iconClass = Icon === LoaderCircle ? "animate-[spin_1s_linear_infinite]" : "";
  return (
    <motion.button whileHover={disabled ? {} : { y: -1 }} whileTap={disabled ? {} : { scale: 0.97, y: 2 }} transition={{ type: "spring", stiffness: 500, damping: 24 }} disabled={disabled} onClick={onClick}
      className={`flex h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 font-extrabold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}>
      {Icon && <Icon size={18} strokeWidth={2.5} className={iconClass} />} {children}
    </motion.button>
  );
}

export function Top({ title, sub, back, onBack }: { title: string; sub?: string; back?: boolean; onBack?: () => void }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <button aria-label="Back" onClick={onBack} className={`mt-1 grid size-9 place-items-center rounded-xl bg-white text-[#7d6a81] shadow-sm ${back ? "" : "invisible"}`}><ArrowLeft size={18} /></button>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[.16em] text-[#a58da2]">MeowMeow Imposter</p>
        <h1 className="font-[Baloo_2] text-[30px] font-extrabold leading-8 tracking-[-.02em] text-[#493e58]">{title}</h1>
        {sub && <p className="mt-1 text-[13px] font-bold leading-5 text-[#887a8d]">{sub}</p>}
      </div>
    </div>
  );
}

export function VoiceControls({ micOn, setMicOn, speakerOn, setSpeakerOn }: any) {
  return (
    <div className="flex gap-1.5">
      <button aria-label="Toggle microphone" onClick={() => setMicOn(!micOn)} className={`grid size-8 place-items-center rounded-xl transition ${micOn ? "bg-[#e2f4ea] text-[#4d9575]" : "bg-[#ffe5e7] text-[#d66470]"}`}>{micOn ? <Mic size={16} /> : <MicOff size={16} />}</button>
      <button aria-label="Toggle speaker" onClick={() => setSpeakerOn(!speakerOn)} className={`grid size-8 place-items-center rounded-xl transition ${speakerOn ? "bg-[#e9e3fb] text-[#7561aa]" : "bg-[#f2edf1] text-[#9a8b99]"}`}>{speakerOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
    </div>
  );
}

export function TimerRing({ value, label, tone = "pink" }: { value: string; label: string; tone?: "pink" | "blue" }) {
  const colors = tone === "pink" ? "border-[#ef8cad] bg-[#fff3f7] text-[#db668c]" : "border-[#8fc9e5] bg-[#effaff] text-[#5c96b5]";
  return (
    <motion.div animate={{ rotate: [0, 1.5, -1.5, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} className={`grid size-28 place-items-center rounded-full border-[7px] ${colors} shadow-[0_4px_0_rgba(123,91,117,.12)]`}>
      <div className="text-center">
        <p className="font-[Baloo_2] text-xl font-extrabold leading-5">{value}</p>
        <p className="mt-1 text-[9px] font-extrabold uppercase tracking-widest">{label}</p>
      </div>
    </motion.div>
  );
}

export function SliderCard({ title, helper, value, setValue, options, locked }: any) {
  return (
    <div className="rounded-[25px] bg-white p-4 shadow-[0_4px_0_#eee3e9]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-[Baloo_2] text-lg font-extrabold text-[#55495e]">{title}</h3>
          <p className="text-xs font-bold text-[#a08d9d]">{helper}</p>
        </div>
        <Badge tone={locked ? "cream" : "lavender"}>{locked ? <><Lock size={10} /> LOCKED</> : options[value]}</Badge>
      </div>
      <input aria-label={title} disabled={locked} type="range" min="0" max={options.length - 1} value={value} onChange={(e) => setValue(Number(e.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#f3e8ef] accent-[#ef7fa7] disabled:cursor-not-allowed" />
      <div className="mt-2 flex justify-between text-[9px] font-extrabold text-[#b19ba9]"><span>{options[0]}</span><span>{options[options.length - 1]}</span></div>
    </div>
  );
}

export function Segmented({ title, helper, options, value, setValue }: { title: string; helper: string; options: { label: string; icon: string; desc: string }[]; value: number; setValue: (v: number) => void }) {
  return (
    <div className="rounded-[25px] bg-white p-4 shadow-[0_4px_0_#eee3e9]">
      <h3 className="font-[Baloo_2] text-lg font-extrabold text-[#55495e]">{title}</h3>
      <p className="mb-3 text-xs font-bold text-[#a08d9d]">{helper}</p>
      <div className="flex gap-2 rounded-2xl bg-[#faf4f8] p-1.5">
        {options.map((o, i) => (
          <motion.button key={o.label} whileTap={{ scale: 0.97 }} onClick={() => setValue(i)}
            className={`flex-1 rounded-xl px-3 py-2 text-left transition ${i === value ? "bg-white text-[#b04f73] shadow-[0_3px_0_#f0dbe5]" : "text-[#a08d9d]"}`}>
            <p className="text-sm font-extrabold">{o.icon} {o.label}</p>
            <p className="text-[10px] font-bold leading-4 opacity-80">{o.desc}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function SlideConfirm({ label, done, onDone }: { label: string; done: boolean; onDone: () => void }) {
  const maxX = 188;
  const [dragX, setDragX] = useState(0);

  const complete = (nextX: number) => {
    if (done) return;
    const clamped = Math.min(maxX, Math.max(0, nextX));
    setDragX(clamped);
    if (clamped > maxX * 0.55) {
      setDragX(maxX);
      onDone();
    } else {
      setDragX(0);
    }
  };

  return (
    <motion.div
      className="relative flex h-14 w-full items-center overflow-hidden rounded-2xl bg-[#fdeaf1] px-2 shadow-[0_5px_0_#f1d3e0]"
      onClick={() => {
        if (!done) complete(maxX);
      }}>
      <motion.span
        drag="x"
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0.12}
        dragMomentum={false}
        animate={done ? { x: maxX } : { x: dragX }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onDrag={(_, info) => {
          setDragX(Math.min(maxX, Math.max(0, info.offset.x)));
        }}
        onDragEnd={(_, info) => {
          complete(info.offset.x);
        }}
        onTap={() => {
          if (!done) complete(maxX);
        }}
        className="absolute z-10 grid size-10 place-items-center rounded-xl bg-[#ef6d9a] text-white shadow-[0_3px_0_#cf547e]">🐾</motion.span>
      <span className="w-full text-center font-extrabold text-[#b04f73]">{done ? "Confirmed! ✨" : label}</span>
    </motion.div>
  );
}

export function Dialog({ open, emoji, title, body, primary, secondary, onClose }: { open: boolean; emoji: string; title: string; body: string; primary: string; secondary?: string; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#4b3d55]/35 px-6">
      <motion.div initial={{ scale: 0.9, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="w-full rounded-[28px] bg-white p-5 text-center shadow-[0_12px_0_rgba(116,78,115,.15)]">
        <div className="mx-auto grid size-16 place-items-center rounded-[45%] bg-[#fbe9ef] text-2xl">{emoji}</div>
        <h3 className="mt-3 font-[Baloo_2] text-2xl font-extrabold text-[#493e58]">{title}</h3>
        <p className="mt-1 text-[13px] font-bold leading-5 text-[#887a8d]">{body}</p>
        <div className="mt-4 space-y-2">
          <Button onClick={onClose}>{primary}</Button>
          {secondary && <Button variant="ghost" onClick={onClose}>{secondary}</Button>}
        </div>
      </motion.div>
    </div>
  );
}

export function Toast({ text }: { text: string }) {
  return (
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-2xl bg-[#4f4159] px-4 py-2 text-xs font-extrabold text-white shadow-[0_6px_0_rgba(79,65,89,.25)]">{text}</motion.div>
  );
}

export function Sky() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {["☁️","✨","🐾","💗","⭐","🫧","🌸","🐟"].map((s, i) => (
        <motion.span key={i} className="absolute text-sm opacity-40"
          style={{ left: `${(i * 13 + 6) % 92}%`, top: `${(i * 23 + 8) % 88}%` }}
          animate={{ y: [0, -10, 0], opacity: [0.25, 0.5, 0.25] }}
          transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}>{s}</motion.span>
      ))}
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => <div key={i} className="h-14 w-full animate-pulse rounded-2xl bg-[#f6ecf2]" />)}
    </div>
  );
}
