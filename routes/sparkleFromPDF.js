import express from "express";
import axios from "axios";
import PDFParser from "pdf2json";

import { postSparkle } from "./sparkles.js";
import { saveBug } from "./bugs.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

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

router.post("/", auth, async (req, res) => {
    try {
        const { pdfUrl, communities } = req.body;

        console.log("Processing PDF download:", {
            userId: req.user?._id,
            pdfUrl,
        });

        if (!pdfUrl || typeof pdfUrl !== "string") {
            const error = "No valid PDF URL provided";
            await saveBug(error);
            return res.status(400).send({ error });
        }

        // Download the PDF from the URL
        const response = await axios({
            url: pdfUrl,
            method: "GET",
            responseType: "arraybuffer", // Get the PDF as a buffer
            maxContentLength: 5 * 1024 * 1024, // 5MB limit
        });

        const pdfBuffer = Buffer.from(response.data);
        const pdfParser = new PDFParser();

        // Parse the PDF buffer
        const pdfData = await new Promise((resolve, reject) => {
            pdfParser.on("pdfParser_dataError", (err) => reject(err));
            pdfParser.on("pdfParser_dataReady", (pdfData) => resolve(pdfData));
            pdfParser.parseBuffer(pdfBuffer);
        });

        const fullText = pdfParser.getRawTextContent();
        console.log("text ", fullText);
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
                        communities: communities || [],
                    });
                } catch (sparkleError) {
                    await saveBug(`Failed to post sparkle: ${sparkleError.message}`);
                }
            })
        );

        const responseData = {
            totalSections: summarizedSections.length,
            sections: summarizedSections,
            totalPages: pdfData.formImage.Pages.length,
            metadata: {
                pdfUrl,
                fileSize: pdfBuffer.length,
                processedAt: new Date().toISOString(),
            },
        };
        console.log("res ", responseData);
        res.status(200).send(responseData);
    } catch (error) {
        console.error("PDF route error:", error);
        let errorMessage = "Error processing PDF";
        let statusCode = 500;

        // Handle specific errors
        if (error.response) {
            // Axios error (e.g., URL not found or server error)
            errorMessage = `Failed to download PDF: ${error.response.statusText}`;
            statusCode = 400;
        } else if (error.message.includes("maxContentLength")) {
            errorMessage = "PDF file exceeds 5MB limit";
            statusCode = 400;
        }

        await saveBug(`${errorMessage}: ${error.message}`);
        res.status(statusCode).json({
            error: errorMessage,
            details: error.message,
        });
    }
});

router.use(async (err, req, res, next) => {
    console.error("Unexpected error:", err);
    await saveBug(`Unexpected error: ${err.message}`);
    res.status(500).json({
        error: "Internal server error",
        details: err.message,
    });
});

export default router;
