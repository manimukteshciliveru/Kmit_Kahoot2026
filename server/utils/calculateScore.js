/**
 * Centralized Scoring Logic for QuizMaster
 * Handles different question types and time-based bonuses
 */

const calculateScore = (question, answer, timeTakenSeconds, quizSettings = {}) => {
    if (!answer) return { isCorrect: false, scoreAwarded: 0 };

    const normalize = (str) => str.toString().toLowerCase().trim();
    const userAnswer = normalize(answer);

    let isCorrect = false;

    // 1. Correctness Logic
    switch (question.type) {
        case 'mcq':
            isCorrect = userAnswer === normalize(question.correctAnswer);
            break;

        case 'msq':
            // Multi-select: Answer is comma-separated string
            const userAnsSet = new Set(String(answer).split(',').map(normalize));
            const correctAnsSet = new Set(String(question.correctAnswer).split(',').map(normalize));

            if (userAnsSet.size !== correctAnsSet.size) {
                isCorrect = false;
            } else {
                isCorrect = [...correctAnsSet].every(val => userAnsSet.has(val));
            }
            break;

        case 'fill-blank':
            const possibilities = String(question.correctAnswer).split('|').map(normalize);
            isCorrect = possibilities.includes(userAnswer);
            break;

        case 'qa':
            // Flexible matching for Q&A
            const expected = normalize(question.correctAnswer);
            // Check if user answer contains key phrases or vice-versa
            isCorrect = userAnswer.includes(expected) || expected.includes(userAnswer) ||
                (userAnswer.length > 3 && expected.length > 3 &&
                    (userAnswer.startsWith(expected.substring(0, 4)) || expected.startsWith(userAnswer.substring(0, 4))));
            break;

        default:
            isCorrect = false;
    }

    if (!isCorrect) return { isCorrect: false, scoreAwarded: 0 };

    // 2. Points Calculation
    let points = question.points || 1000; // Default to 1000 like Kahoot

    // 3. Time-Based Bonus (Optional - if timeLimit exists)
    // Formula: points * (1 - (timeTaken / totalTime) * 0.5)
    // This gives at least 50% points even if answered at the last second
    if (timeTakenSeconds > 0 && question.timeLimit > 0) {
        const timeRatio = Math.min(timeTakenSeconds / question.timeLimit, 1);
        const bonusFactor = 1 - (timeRatio * 0.5);
        points = Math.round(points * bonusFactor);
    }

    return {
        isCorrect: true,
        scoreAwarded: points,
        timeTaken: timeTakenSeconds
    };
};

module.exports = { calculateScore };
