import Mailgen from "mailgen";
import { Resend } from "resend";

import requireEnv from "../utils/requireEnv.js";

const resend = new Resend(requireEnv("RESEND_API_KEY"));

function generateHTMLEmail({ message }) {
  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "Sparkler",
      link: "https://sparkler.website/",
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
    from: "Sparkler@sparkler.website",
    to,
    subject,
    html: generateHTMLEmail({ message }),
    text: htmlEmail ? "" : `Hello, ${message}`,
  });
}
