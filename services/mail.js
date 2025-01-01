import nodemailer from "nodemailer";
import Mailgen from "mailgen";

const transporter = nodemailer.createTransport({
    host: "live.smtp.mailtrap.io",
    port: 587,
    secure: false,
    auth: {
        user: "api",
        pass: process.env.EMAIL_PASS,
    },
});

function generateHTMLEmail({ message }) {
    const mailGenerator = new Mailgen({
        theme: "default",
        product: {
            name: "Sparkler",
            link: "https://sparkler.lol/",
            logo: '',
        },
    });

    return mailGenerator.generate({
        body: {
            name: 'Sparkler',
            intro: message,
            outro: `Connect with ease!`,
        },
    });
}

export async function sendMail({ message, to, subject }) {
    const htmlEmail = generateHTMLEmail({ message });

    return await transporter.sendMail({
        from: "Sparkler@demomailtrap.com",
        to,
        subject,
        text: htmlEmail ? "" : `Hello Sparkler, ${message}`,
        html: htmlEmail || "",
    });
}
