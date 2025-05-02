import { SimpleDB } from './simpleDB.mjs';

let dbInstance = null;
let settingsCollectionInstance = null;

export function getDB() {
    if (!dbInstance) {
        dbInstance = new SimpleDB();
    }
    return dbInstance;
}


export function getSettingsCollection() {
    if (!settingsCollectionInstance) {
        const db = getDB();
        settingsCollectionInstance = db.collection('guildSettings');
    }
    return settingsCollectionInstance;
}

export function getGuildSettings(guildId) {
    if (!guildId) return null;
    
    const settingsCollection = getSettingsCollection();
    let settings = settingsCollection.findOne({ guildId: guildId });
    
    if (!settings) {
        settings = {
            guildId: guildId,
            twentyFourSevenEnabled: false,
            voiceChannelId: null,
            textChannelId: null
        };
        settingsCollection.insert(settings);
    }
    
    return settings;
}

export function updateGuildSettings(guildId, updates) {
    if (!guildId) return 0;
    
    const settingsCollection = getSettingsCollection();
    return settingsCollection.update({ guildId: guildId }, updates);
}

export function isTwentyFourSevenEnabled(guildId) {
    if (!guildId) return false;
    
    const settings = getGuildSettings(guildId);
    return settings?.twentyFourSevenEnabled === true;
}

export function getChannelIds(guildId) {
    if (!guildId) return null;
    
    const settings = getGuildSettings(guildId);
    if (settings?.twentyFourSevenEnabled === true) {
        return {
            voiceChannelId: settings.voiceChannelId,
            textChannelId: settings.textChannelId
        };
    }
    return null;
}
