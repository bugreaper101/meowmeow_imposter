export type MeowAvatar = {
  name: string; color: string; face: string; accessory: string; outfit: string;
  personality: string; points: number; kind: "Boy" | "Girl" | "Creature"; host?: boolean; taken?: boolean;
};

const boyNames = ["Mochi","Taro","Nori","Boba","Coco","Wink","Miso","Crumb","Orbit","Panko","Sprout","Puddle","Dumpling","Pounce","Biscuit","Nimbus","Waffle","Sesame","Marlo","Pesto","Cobble","Tofu","Domino","Rusk","Bramble","Scout","Pockets","Noodle","Yuzu","Kombu"];
const girlNames = ["Lumi","Pip","Mimi","Tutu","Poppy","Mallow","Peachy","Minty","Dottie","Berry","Kiki","Fizzy","Tinsel","Sundae","Zuzu","Taffy","Plum","Cherry","Marzi","Peony","Lolly","Bijou","Suki","Clover","Pearl","Ruffle","Momo","Sorbet","Velvet","Dandy"];
const creatureNames = ["Blobby","Gizmo","Sprocket","Wisp","Mothy","Kelpie","Nugget","Quill","Ember","Snorp"];

const palette = ["bg-[#f5a6bd]","bg-[#a8d9f4]","bg-[#b7e6c9]","bg-[#cdbcf1]","bg-[#ffd3a7]","bg-[#b8d6c1]","bg-[#d7b5a1]","bg-[#f4c9e7]","bg-[#9fd4d8]","bg-[#f3aa89]","bg-[#d4c7a6]","bg-[#e8e0f6]","bg-[#ffc8bd]","bg-[#bcebd7]","bg-[#f9e58d]","bg-[#ce9cbd]","bg-[#a6c5ee]","bg-[#f3dcc7]","bg-[#91c6e2]","bg-[#f4a8b1]","bg-[#c8d986]","bg-[#d8c1f0]","bg-[#e6c28f]","bg-[#f8d5d8]","bg-[#9c9ce2]","bg-[#e5cfac]","bg-[#e6a9dc]","bg-[#b6a18d]","bg-[#e9b3cc]","bg-[#a984ba]"];
const faces = ["•ᴗ•","˶ᵔ ᵕ ᵔ˶","ᵔᴥᵔ","•̀ᴗ•́","ᵕ̈","ᵔⰙᵔ","•⩊•","◕ᴗ◕","⌒ᴗ⌒","•ω•","-ᴗ•","˙ᵕ˙","ᵔᵕᵔ","•‿•","•ᴗ<","ᵔ⩊ᵔ","⌯'▾'⌯","˶•⩊•˶","´꒳`","^ᴗ^"];
const boyKit = ["🧢","🎧","🐾","🥟","🪐","🍃","🧣","🫐","🥨","🕶️","🍜","🎣","🪁","🧦","⚓"];
const girlKit = ["🎀","⭐","🌼","🦋","🍓","☁️","🍑","🪴","🎨","✨","🍒","💜","🧸","🔮","🌸"];
const creatureKit = ["🫧","🪼","🍄","🌙","🐟","🧶","🐚","🌈","🔥","🪄"];
const outfits = ["rose cardigan","sky hoodie","mint vest","violet tee","apricot scarf","forest overalls","cocoa knit","petal dress","aqua romper","coral pinafore","sand jacket","lilac cape","peach bow","leaf collar","sunny smock"];
const traits = ["sunny","dreamy","bubbly","mischievous","curious","gentle","cozy","sweet","calm","bold","sly","floaty","cheery","thoughtful","artsy","brave","musical","shy","chill","sparkly"];

function make(names: string[], kind: MeowAvatar["kind"], kit: string[]): MeowAvatar[] {
  return names.map((name, i) => ({
    name,
    color: palette[i % palette.length]!,
    face: faces[i % faces.length]!,
    accessory: kit[i % kit.length]!,
    outfit: outfits[i % outfits.length]!,
    personality: traits[i % traits.length]!,
    points: 0,
    kind,
    taken: i % 11 === 7,
  }));
}

export const avatarCatalog: MeowAvatar[] = [
  ...make(boyNames, "Boy", boyKit),
  ...make(girlNames, "Girl", girlKit),
  ...make(creatureNames, "Creature", creatureKit),
];

export const roster: MeowAvatar[] = avatarCatalog
  .filter((_, i) => i % 4 === 0)
  .slice(0, 12)
  .map((a, i) => ({ ...a, points: [80, 70, 55, 40, 35, 30, 25, 20, 18, 14, 10, 8][i] ?? 0, host: i === 0, taken: false }));

export const flow = [
  "Splash","Welcome","Create Room","Join Room","Avatar","Host Settings","Lobby","Writer Input",
  "Waiting","Role Reveal","Ready","Clue Phase","Discussion","Round Result","Scoreboard","Final Winner","About",
];

export const roundOptions = Array.from({ length: 50 }, (_, i) => String(i + 1));
export const imposterOptions = ["👤 1 Imposter","👥 2 Imposters","👥 3 Imposters","👥 4 Imposters","👥 5 Imposters"];
export const clueOptions = ["∞ Unlimited","10s","30s","45s","1m","2m","3m","4m","5m"];
export const discussionOptions = ["∞ Unlimited","30s","1m","2m","3m","5m","7m","10m"];
export const tips = [
  "🐾 Stay mysterious!",
  "🐾 Don’t reveal the secret word!",
  "🐾 Observe everyone’s clues carefully!",
  "🐾 The cutest player isn’t always innocent!",
];
