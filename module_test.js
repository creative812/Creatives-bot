try { require('./utils/embeds.js'); console.log('Embeds.js loaded'); } catch (e) { console.log('MISSING: embeds.js', e); }
try { require('./utils/logger.js'); console.log('Logger.js loaded'); } catch (e) { console.log('MISSING: logger.js', e); }
try { require('./database/database.js'); console.log('Database.js loaded'); } catch (e) { console.log('MISSING: database.js', e); }
try { require('./commands/level.js'); console.log('Level.js loaded'); } catch (e) { console.log('MISSING: level.js', e); }
