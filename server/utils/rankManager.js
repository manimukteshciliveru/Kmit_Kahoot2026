/**
 * Rank Logic Manager
 * Tiers: Bronze -> Silver -> Gold -> Platinum -> Diamond -> Heroic -> Grandmaster
 * Levels: 1, 2, 3 (III, II, I)
 * Base points per win: +20
 */

const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Heroic', 'Grandmaster'];
const POINTS_PER_TIER = 300; // 100 points per level (3 levels)

const getRankInfo = (totalPoints) => {
    if (totalPoints < 0) totalPoints = 0;

    const tierIndex = Math.floor(totalPoints / POINTS_PER_TIER);
    const cappedTierIndex = Math.min(tierIndex, TIERS.length - 1);
    
    const tier = TIERS[cappedTierIndex];
    const pointsInTier = totalPoints % POINTS_PER_TIER;
    
    // Level 3 (0-99), Level 2 (100-199), Level 1 (200-299)
    // Grandmaster doesn't have levels usually, just points
    let level = 3 - Math.floor(pointsInTier / 100);
    if (tier === 'Grandmaster') level = 1;

    // Progress to next level/tier (0-100%)
    const progress = (pointsInTier % 100); 

    return { tier, level, progress, totalPoints };
};

const calculateMatchReward = (isWin, performance = {}) => {
    // performance: { streak, accuracy, speed }
    let points = isWin ? 25 : -15;

    // Win Streak Bonus (capped at +15)
    if (isWin && performance.streak > 1) {
        points += Math.min(performance.streak * 2, 15);
    }

    // Performance Bonus (based on accuracy 0-1)
    if (isWin && performance.accuracy > 0.8) {
        points += 5;
    }

    return points;
};

module.exports = {
    getRankInfo,
    calculateMatchReward,
    TIERS
};
