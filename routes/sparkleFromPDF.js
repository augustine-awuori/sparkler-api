import express from "express";
import multer from "multer";
import PDFParser from "pdf2json";

import { postSparkle } from "./sparkles.js";
import { saveBug } from "./bugs.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

// Check environment variables (Railway-specific)
const requiredEnvVars = ["NODE_ENV"]; // Add your auth-related env vars here
requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`Missing environment variable: ${varName}`);
    }
});

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/pdf") cb(null, true);
        else cb(new Error("Please upload a PDF file"), false);
    },
});

function summarizeText(text = "", maxLength = 200) {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    let summary = "";
    let currentLength = 0;

    for (let sentence of sentences) {
        if (currentLength + sentence.length <= maxLength) {
            summary += sentence.trim() + ". ";
            currentLength += sentence.length;
        } else break;
    }
    return summary.trim();
}

router.post("/", [upload.single("pdf"), auth], async (req, res) => {
    try {
        console.log("Processing PDF upload:", {
            userId: req.user?._id,
            fileSize: req.file?.size,
        });

        if (!req.user?._id) {
            const error = "User not authenticated";
            await saveBug(error);
            return res.status(401).json({ error });
        }

        if (!req.file) {
            const error = "No PDF file uploaded";
            await saveBug(error);
            return res.status(400).json({ error });
        }

        const userId = req.user._id.toString();
        const pdfBuffer = req.file.buffer;

        const pdfParser = new PDFParser();

        const pdfData = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", (err) => reject(err));
            pdfParser.on("pdfParser_dataReady", (pdfData) => resolve(pdfData));
            pdfParser.parseBuffer(pdfBuffer);
        });

        const fullText = pdfParser.getRawTextContent();
        const paragraphs = fullText
            .split(/\n\s*\n/)
            .filter((p) => p.trim().length > 50);

        const summarizedSections = paragraphs.map((paragraph, index) => {
            const summary = summarizeText(paragraph);
            return {
                section: `Section ${index + 1}`,
                originalLength: paragraph.length,
                summary,
                summaryLength: summary.length,
            };
        });

        await Promise.all(
            summarizedSections.map(async (section) => {
                try {
                    await postSparkle(req.user, {
                        text: section.summary,
                        communities: req.body.communities || [],
                    });
                } catch (sparkleError) {
                    await saveBug(`Failed to post sparkle: ${sparkleError.message}`);
                }
            })
        );

        const response = {
            totalSections: summarizedSections.length,
            sections: summarizedSections,
            totalPages: pdfData.formImage.Pages.length,
            metadata: {
                originalFileName: req.file.originalname,
                fileSize: req.file.size,
                processedAt: new Date().toISOString(),
            },
        };

        res.status(200).json(response);
    } catch (error) {
        console.error("PDF route error:", error);
        await saveBug(`PDF processing error: ${error.message}`);
        res.status(500).json({
            error: "Error processing PDF",
            details: error.message,
        });
    }
});

router.use(async (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.error("Multer error:", err);
        await saveBug(err.message);
        return res.status(400).json({ error: err.message });
    }
    console.error("Unexpected error:", err);
    await saveBug(`Unexpected error: ${err.message}`);
    res.status(500).json({
        error: "Internal server error",
        details: err.message,
    });
});

export default router;
