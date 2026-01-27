
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
  STANDARD = 'Standard',
  
  // Modern Group
  MODERN = 'Modern',
  MINIMALIST = 'Minimalist',
  JAPANDI = 'Japandi',
  WABI_SABI = 'Wabi Sabi',
  SCANDINAVIAN = 'Scandinavian',
  MID_CENTURY = 'Mid-Century Modern',
  BAUHAUS = 'Bauhaus',
  LUXURY = 'Luxury Contemporary',

  // Classic Group
  NEOCLASSIC = 'Neoclassical',
  INDOCHINE = 'Indochine',
  MEDITERRANEAN = 'Mediterranean',
  ART_DECO = 'Art Deco',
  MOROCCAN = 'Moroccan',
  VICTORIAN = 'Victorian',

  // Rustic & Nature Group
  TROPICAL = 'Tropical Resort',
  FRAME_HOUSE = 'Frame House',
  FARMHOUSE = 'Farmhouse',
  BRUTALIST = 'Brutalist',
  COTTAGECORE = 'Cottagecore',

  // Industrial & Future Group
  INDUSTRIAL = 'Industrial',
  FUTURISTIC = 'Futuristic',
  CYBERPUNK = 'Cyberpunk',

  OTHERS = 'Others'
}

export enum ImageQuality {
  AUTO = 'Auto',
  STANDARD = 'Standard',
  HD = 'HD',
  Q2K = '2K',
  Q4K = '4K'
}

export enum RenderEngine {
  DEFAULT = 'Default',
  // Interior focused (often used)
  BLENDER_CYCLES = 'Blender Cycles',
  CORONA = 'Corona Renderer',
  MARMOSET = 'Marmoset Toolbag',
  MAXWELL = 'Maxwell Render',
  OCTANE = 'Octane Render',
  UNREAL = 'Unreal Engine 5',
  VRAY = 'V-Ray',
  // Architecture/Exterior focused (realtime/large scale)
  D5 = 'D5 Render',
  ENSCAPE = 'Enscape',
  LUMION = 'Lumion',
  REDSHIFT = 'Redshift',
  TWINMOTION = 'Twinmotion'
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

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  type: MediaType;
  timestamp: number;
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
