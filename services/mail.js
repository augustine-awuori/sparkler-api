import Mailgen from "mailgen";
import { Resend } from "resend";

const resend = new Resend(process.env.EMAIL_PASS);

function generateHTMLEmail({ message }) {
    const mailGenerator = new Mailgen({
        theme: "default",
        product: {
            name: "Sparkler",
            link: "https://sparkler.lol/",
            logo: "",
        },
    });

    return mailGenerator.generate({
        body: {
            name: "Sparkler",
            intro: message,
            outro: "Connect with ease!",
        },
    });
}

export async function sendMail({ message, to, subject }) {
    const htmlEmail = generateHTMLEmail({ message });

    return await resend.emails.send({
        from: "Sparkler@sparkler.lol",
        to,
        subject,
        html: generateHTMLEmail({ message }),
        text: htmlEmail ? "" : `Hello Sparkler, ${message}`,
    });
}
