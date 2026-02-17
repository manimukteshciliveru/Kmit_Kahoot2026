const { getClient } = require('../config/redis');

// Redis keys are stored as `leaderboard:quizId:score`
const getKey = (quizId) => `leaderboard:${quizId}`;

class LeaderboardService {
    /**
     * Update user score in Redis Sorted Set
     * @param {string} quizId 
     * @param {string} userId 
     * @param {number} score 
     * @param {string} role (optional, for filtering) - not directly used in score but context
     */
    static async updateScore(quizId, userId, score) {
        const client = getClient();
        if (!client) return; // Fallback to DB only

        try {
            await client.zAdd(getKey(quizId), { score, value: userId });
            console.log(`[Redis] Updated score for ${userId} in ${quizId}`);
        } catch (error) {
            console.error('[Redis] Failed to update leaderboard:', error);
        }
    }

    /**
     * Increment score (for correct answers)
     * @param {string} quizId 
     * @param {string} userId 
     * @param {number} increment 
     */
    static async incrementScore(quizId, userId, increment) {
        const client = getClient();
        if (!client) return;

        try {
            await client.zIncrBy(getKey(quizId), increment, userId);
        } catch (error) {
            console.error('[Redis] Failed to increment score:', error);
        }
    }

    /**
     * Get top N players and their scores
     * @param {string} quizId 
     * @param {number} limit 
     * @returns {Promise<Array>} Array of { userId, score, rank }
     */
    static async getTop(quizId, limit = 10) {
        const client = getClient();
        if (!client) return [];

        try {
            // Get value and score, sorted descending
            const results = await client.zRangeWithScores(getKey(quizId), 0, limit - 1, { REV: true });

            // Transform to easier strucuture
            return results.map((entry, index) => ({
                userId: entry.value,
                score: entry.score,
                rank: index + 1
            }));
        } catch (error) {
            console.error('[Redis] Failed to fetch leaderboard:', error);
            return [];
        }
    }

    /**
     * Get individual user rank and score
     * @param {string} quizId 
     * @param {string} userId 
     */
    static async getUserRank(quizId, userId) {
        const client = getClient();
        if (!client) return null;

        try {
            const rank = await client.zRevRank(getKey(quizId), userId);
            const score = await client.zScore(getKey(quizId), userId);

            return {
                rank: rank !== null ? rank + 1 : null,
                score
            };
        } catch (error) {
            console.error('[Redis] Failed to fetch user rank:', error);
            return null;
        }
    }

    /**
     * Cleanup leaderboard after quiz ends (optional, usually keep for history or let expire)
     * @param {string} quizId 
     */
    static async clear(quizId) {
        const client = getClient();
        if (!client) return;

        try {
            await client.del(getKey(quizId));
            // Also cleanup related keys if any
        } catch (error) {
            console.error('[Redis] Failed to clear leaderboard:', error);
        }
    }
}

module.exports = LeaderboardService;
