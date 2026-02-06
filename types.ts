
export enum MediaType {
  NONE = 'None',
  STANDARD = 'Standard',
  POSTER = 'Poster',
  KEY_VISUAL = 'Key Visual',
  SOCIAL_POST = 'Social Media Post',
  WALLPAPER = 'Wallpaper',
  COVER_ART = 'Cover Art',
  BANNER = 'Web Banner',
  CARD = 'Greeting Card'
}

export enum ArchitectureStyle {
  NONE = 'None',
  // Standalone
  STANDARD = 'Standard',
  OTHERS = 'Others',

  // Modern
  BAUHAUS = 'Bauhaus',
  JAPANDI = 'Japandi',
  LUXURY = 'Luxury Contemporary',
  MID_CENTURY = 'Mid-Century Modern',
  MINIMALIST = 'Minimalist',
  MODERN = 'Modern',
  SCANDINAVIAN = 'Scandinavian',
  WABI_SABI = 'Wabi Sabi',
  
  // Classic
  ART_DECO = 'Art Deco',
  INDOCHINE = 'Indochine',
  MEDITERRANEAN = 'Mediterranean',
  MOROCCAN = 'Moroccan',
  NEOCLASSIC = 'Neoclassical',
  VICTORIAN = 'Victorian',

  // Rustic & Nature
  BRUTALIST = 'Brutalist',
  COTTAGECORE = 'Cottagecore',
  FARMHOUSE = 'Farmhouse',
  FRAME_HOUSE = 'Frame House',
  TROPICAL = 'Tropical Resort',

  // Industrial & Future
  CYBERPUNK = 'Cyberpunk',
  FUTURISTIC = 'Futuristic',
  INDUSTRIAL = 'Industrial'
}

export enum RenderEngine {
  DEFAULT = 'Default',
  // Interior / Ray Tracing
  BLENDER = 'Blender Cycles',
  CORONA = 'Corona Renderer',
  MAXWELL = 'Maxwell Render',
  OCTANE = 'Octane Render',
  REDSHIFT = 'Redshift',
  VRAY = 'V-Ray',
  // Exterior / Real-time
  D5 = 'D5 Render',
  ENSCAPE = 'Enscape',
  LUMION = 'Lumion',
  MARMOSET = 'Marmoset Toolbag',
  TWINMOTION = 'Twinmotion',
  UNREAL = 'Unreal Engine 5'
}

export enum LightingSetting {
  DEFAULT = 'Default',
  // Time of Day
  SUNRISE = 'Sunrise',
  SUNNY_DAY = 'Sunny Day',
  NOON = 'Noon',
  GOLDEN_HOUR = 'Golden Hour',
  BLUE_HOUR = 'Blue Hour',
  NIGHT = 'Night',
  // Weather & Environment
  OVERCAST = 'Overcast',
  RAINY = 'Rainy',
  SNOWY = 'Snowy',
  FOGGY = 'Foggy/Misty',
  // Artificial & Indoor
  WARM_INTERIOR = 'Warm Interior',
  STUDIO = 'Studio',
  NEON = 'Neon/Cyberpunk',
  // Mood & Artistic
  CINEMATIC = 'Cinematic',
  MOODY = 'Moody',
  BIOLUMINESCENT = 'Bioluminescent'
}

export enum ImageQuality {
  AUTO = 'Auto',
  STANDARD = 'Standard',
  Q2K = '2K',
  Q4K = '4K'
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  type: MediaType;
  timestamp: number;
  isEdit?: boolean;
}

export interface User {
  username: string;
  credits: number;
  avatarUrl: string;
  id?: number; 
  role?: 'admin' | 'user';
  status?: 'active' | 'banned';
  team?: string;
  session_token?: string;
  web_access?: 'EK' | 'KAT' | 'ALL'; // Updated BOTH to ALL
}

export const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1', desc: 'Square' },
  { label: '9:16', value: '9:16', desc: 'Story' },
  { label: '16:9', value: '16:9', desc: 'Wide' },
  { label: '3:4', value: '3:4', desc: 'Portrait' },
  { label: '4:3', value: '4:3', desc: 'Classic' },
];

export interface GenerationConfig {
  prompt: string;
  mediaType: MediaType;
  aspectRatio: string;
}
