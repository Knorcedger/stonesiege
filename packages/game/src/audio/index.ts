// Public surface of the procedural audio system.
export { AudioEngine, SFX_CATEGORY } from './engine';
export { GameAudio, workVoice } from './events';
export { playVoice, startAmbient, type SfxName } from './synth';
export {
  Narrator,
  createBrowserSpeech,
  primeSpeechOnGesture,
  deliveryFor,
  pickNarrationVoice,
  speechText,
  estimateSpeechMs,
  voiceScore,
  type NarrationLine,
  type NarrationRequest,
  type NarrationVoice,
  type SpeechSeam,
} from './narration';
export { SfxThrottle, DEFAULT_POLICIES, attenuation, type CategoryPolicy } from './throttle';
