import { cooldownMiddleware } from "./cooldown.middleware";
import { checkPlayer, checkVoice, checkTrack } from './internals'
export const middlewares = {
    cooldown: cooldownMiddleware
    , checkPlayer
    , checkVoice
    , checkTrack

}