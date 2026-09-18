import Mailgen from "mailgen";
import { Resend } from "resend";

import { config } from "../config/index.js";

let resend: Resend | undefined;

function client(): Resend {
  resend ??= new Resend(config().resendApiKey);
  return resend;
}

const mailGenerator = new Mailgen({
  theme: "default",
  product: {
    name: "Sparkler",
    link: "https://sparkler.website/",
    logo: "",
  },
});

export interface MailInput {
  message: string;
  to: string | string[];
  subject: string;
}

export async function sendMail({ message, to, subject }: MailInput) {
  const html = mailGenerator.generate({
    body: {
      name: "Sparkler",
      intro: message,
      outro: "Connect with ease!",
    },
  });

  return await client().emails.send({
    from: "Sparkler@sparkler.website",
    to,
    subject,
    html,
    text: html ? "" : `Hello, ${message}`,
  });
}
