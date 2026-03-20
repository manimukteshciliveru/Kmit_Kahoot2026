import OpenAI from 'openai';
import dotenv from 'dotenv';
import Quiz from '../models/Quiz.js'; // Assuming .js extension for imports
import logger from '../utils/logger.js';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * AI Service for Battle Arena
 * Fetches/Generates questions based on selected topic from reputable sources.
 */
class BattleAIService {
    
    async generateBattleQuiz(category, subtopic) {
        try {
            const prompt = `Act as an expert computer science instructor. 
            Generate a set of 5 multiple-choice questions for a 1v1 battle on the subtopic "${subtopic}" within the category "${category}".
            The questions should be similar in style and difficulty to those found on GeeksforGeeks, LeetCode, or W3Schools.
            
            Return ONLY a JSON array with this structure:
            [
              {
                "question": "string",
                "options": ["string", "string", "string", "string"],
                "correctAnswer": 0, // index of correct option
                "explanation": "string",
                "difficulty": "medium",
                "pointValue": 10
              }
            ]
            
            Ensure the code examples (if any) are correctly formatted and the questions are technically accurate.`;

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "You are a professional quiz generator focused on high-quality technical content from GFG, LeetCode, and W3Schools." },
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" }
            });

            const content = JSON.parse(response.choices[0].message.content);
            const questions = content.questions || content; // Handle varying JSON structures

            // Create a temporary quiz for this battle
            const newQuiz = new Quiz({
                title: `${category}: ${subtopic} Battle`,
                description: `Dynamic battle quiz for ${subtopic}`,
                questions: questions.map(q => ({
                    questionText: q.question,
                    options: q.options.map((opt, idx) => ({ 
                        text: opt, 
                        isCorrect: idx === q.correctAnswer 
                    })),
                    points: q.pointValue || 10,
                    questionType: 'multiple-choice'
                })),
                status: 'live',
                isPublic: false // Hidden from general list
            });

            await newQuiz.save();
            return newQuiz;

        } catch (error) {
            logger.error('Error generating battle quiz:', error);
            // Fallback to a default quiz if AI fails
            return await Quiz.findOne({ status: 'live' });
        }
    }
}

export default new BattleAIService();
