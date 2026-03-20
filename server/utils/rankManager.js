const TIER_THRESHOLDS = [
    { tier: 'Bronze', levels: ['I', 'II', 'III'], thresholds: [0, 200, 400], max: 599 },
    { tier: 'Silver', levels: ['I', 'II', 'III'], thresholds: [600, 900, 1200], max: 1499 },
    { tier: 'Gold',   levels: ['I', 'II', 'III'], thresholds: [1500, 1900, 2300], max: 2699 },
    { tier: 'Platinum', levels: ['I', 'II', 'III'], thresholds: [2700, 3100, 3500], max: 3899 },
    { tier: 'Diamond',  levels: ['I', 'II', 'III'], thresholds: [3900, 4200, 4500], max: 4799 },
    { tier: 'Master',   levels: ['Master'], thresholds: [4800], max: 4999 },
    { tier: 'Grandmaster', levels: ['Grandmaster'], thresholds: [5000], max: 10000000 }
];

const getTierByPoints = (points) => {
    const tierConfig = TIER_THRESHOLDS.find(t => points >= t.thresholds[0] && points <= t.max);
    if (!tierConfig) return TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1]; // Fallback to GM

    let level = tierConfig.levels[0];
    for (let i = tierConfig.thresholds.length - 1; i >= 0; i--) {
        if (points >= tierConfig.thresholds[i]) {
            level = tierConfig.levels[i];
            break;
        }
    }
    return { tier: tierConfig.tier, level: level };
};

const expectedScore = (player, opponent) => {
    return 1.0 / (1 + Math.pow(10, (opponent - player) / 400.0));
};

const getKFactor = (points) => {
    if (points < 1500) return 40;        // Bronze-Silver
    else if (points < 3900) return 30;   // Gold-Platinum
    else if (points < 4800) return 25;   // Diamond
    else return 20;                      // Master+
};

const calculatePoints = (playerPoints, opponentPoints, isWin, bonus) => {
    const E = expectedScore(playerPoints, opponentPoints);
    const K = getKFactor(playerPoints);

    const change = K * ((isWin ? 1 : 0) - E);

    return Math.round(change + bonus);
};

module.exports = { calculatePoints, getTierByPoints };
