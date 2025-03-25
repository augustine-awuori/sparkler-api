import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";

import { postSparkle } from "./sparkles.js";
import { saveBug } from "./bugs.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") cb(null, true);
        else cb(new Error("Please upload a PDF file"), false);
    },
});

function summarizeText(text = "", maxLength = 200) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    let summary = "";
    let currentLength = 0;

    for (let sentence of sentences)
        if (currentLength + sentence.length <= maxLength) {
            summary += sentence.trim() + ". ";
            currentLength += sentence.length;
        } else break;

    return summary.trim();
}

router.post("/", [auth, upload.single("pdf")], async (req, res) => {
    try {
        if (!req.file) {
            const error = "No PDF file uploaded"
            saveBug(error);
            return res.status(400).send({ error });
        }

        // Extract text from PDF
        const pdfBuffer = req.file.buffer;
        const pdfData = await pdfParse(pdfBuffer);

        // Split text into rough sections (this is a simple approach)
        const fullText = pdfData.text;
        const paragraphs = fullText
            .split(/\n\s*\n/)
            .filter((p) => p.trim().length > 50); // Filter out very short paragraphs

        // Process sections and create summaries
        const summarizedSections = paragraphs.map((paragraph, index) => {
            const summary = summarizeText(paragraph);
            return {
                section: `Section ${index + 1}`,
                originalLength: paragraph.length,
                summary,
                summaryLength: summary.length,
            };
        });

        const response = {
            totalSections: summarizedSections.length,
            sections: summarizedSections,
            totalPages: pdfData.numpages,
            metadata: {
                originalFileName: req.file.originalname,
                fileSize: req.file.size,
                processedAt: new Date().toISOString(),
            },
        };

        const userId = req.user._id.toString();
        summarizedSections.forEach(
            async (section) => await postSparkle(userId, { text: section.summary })
        );

        res.send(response);
    } catch (error) {
        saveBug(`"PDF processing error:" ${error}`);
        res.status(500).json({
            error: "Error processing PDF",
            details: error.message,
        });
    }
});

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        saveBug(err.message);
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

module.exports = router;
