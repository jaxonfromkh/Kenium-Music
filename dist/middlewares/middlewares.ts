import { cooldownMiddleware } from "./cooldown.middleware";
import { checkPlayer, checkVoice } from './internals'
export const middlewares = {
    cooldown: cooldownMiddleware
    , checkPlayer
    , checkVoice

}