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

const calculatePoints = (currentPoints, isWin, streak) => {
    let winRng = [0, 0];
    let lossRng = [0, 0];

    // Determine the bracket for base win/loss
    if (currentPoints < 1500) { // Bronze - Silver
        winRng = [35, 40];
        lossRng = [5, 10];
    } else if (currentPoints < 3900) { // Gold - Platinum
        winRng = [25, 30];
        lossRng = [15, 20];
    } else if (currentPoints < 4800) { // Diamond
        winRng = [20, 25];
        lossRng = [20, 25];
    } else { // Master - Grandmaster
        winRng = [15, 20];
        lossRng = [25, 35];
    }

    let delta = 0;
    if (isWin) {
        delta = Math.floor(Math.random() * (winRng[1] - winRng[0] + 1)) + winRng[0];
        // Streak Bonuses
        if (streak >= 5) delta += 20;
        else if (streak >= 3) delta += 10;
    } else {
        delta = -(Math.floor(Math.random() * (lossRng[1] - lossRng[0] + 1)) + lossRng[0]);
    }

    return delta;
};

module.exports = { calculatePoints, getTierByPoints };
