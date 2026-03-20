/**
 * Professional Ranking & Tier Config (Starting from 0)
 * Ordered: Bronze (1-3), Silver (1-3), Gold (1-4), Platinum (1-4), Diamond (1-4), Heroic, Grandmaster
 */

const RANK_CONFIG = [
    { name: 'Bronze', levels: 3, thresholds: [0, 100, 200], win: [30, 40], loss: [-10, -5] },
    { name: 'Silver', levels: 3, thresholds: [300, 400, 500], win: [25, 30], loss: [-15, -10] },
    { name: 'Gold', levels: 4, thresholds: [600, 713, 838, 963], win: [20, 25], loss: [-20, -15] },
    { name: 'Platinum', levels: 4, thresholds: [1088, 1213, 1338, 1463], win: [15, 20], loss: [-25, -20] },
    { name: 'Diamond', levels: 4, thresholds: [1588, 1725, 1875, 2025], win: [10, 15], loss: [-35, -25] },
    { name: 'Heroic', levels: 1, thresholds: [2175], win: [8, 12], loss: [-40, -30] },
    { name: 'Grandmaster', levels: 1, thresholds: [3000], win: [5, 10], loss: [-60, -40] }
];

/**
 * Get Rank Details based on points
 */
const getRankInfo = (points) => {
    let currentTier = 'Bronze';
    let currentLevel = 1;

    for (const config of RANK_CONFIG) {
        for (let i = 0; i < config.thresholds.length; i++) {
            if (points >= config.thresholds[i]) {
                currentTier = config.name;
                currentLevel = i + 1;
            } else {
                return { tier: currentTier, level: currentLevel };
            }
        }
    }
    return { tier: 'Grandmaster', level: 1 };
};

/**
 * Calculate RP (Rank Points) for a match
 */
const calculateRP = (isWin, currentPoints, performance = {}) => {
    const { tier } = getRankInfo(currentPoints);
    const config = RANK_CONFIG.find(c => c.name === tier);
    
    // 1. Base Points from Tier
    let base = isWin ? config.win[0] : config.loss[0];
    let range = isWin ? (config.win[1] - config.win[0]) : (config.loss[1] - config.loss[0]);
    
    let points = base + Math.floor(Math.random() * (range + 1));

    // 2. Performance Bonuses (Only for wins)
    if (isWin) {
        points += (performance.correctAnswers || 0) * 2;
        if (performance.avgTime < 5) points += 10;
        else if (performance.avgTime < 10) points += 5;
        if (performance.streak > 1) points += Math.min(performance.streak * 5, 20);
    }

    // Minimum loss enforcement handled at battleHandler level
    return points;
};

module.exports = {
    getRankInfo,
    calculateRP,
    RANK_CONFIG
};
