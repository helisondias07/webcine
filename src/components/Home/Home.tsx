import React from "react";
import {
  IconBrandYoutubeFilled,
  IconFile,
  IconMessageFilled,
  IconScreenShare,
  type IconProps,
} from "@tabler/icons-react";
import { NewRoomButton } from "../TopBar/TopBar";
import styles from "./Home.module.css";

const features = [
  {
    Icon: IconScreenShare,
    title: "Compartilhe sua tela",
    text: "Transmita uma aba, aplicativo ou a tela inteira para seus amigos.",
  },
  {
    Icon: IconBrandYoutubeFilled,
    title: "Vídeos sincronizados",
    text: "Cole um link do YouTube e todos assistem no mesmo instante.",
  },
  {
    Icon: IconMessageFilled,
    title: "Converse na sala",
    text: "Chat e participantes ficam ao lado do vídeo, sem interromper a sessão.",
  },
  {
    Icon: IconFile,
    title: "Seus próprios arquivos",
    text: "Escolha um vídeo do dispositivo e transmita diretamente para a sala.",
  },
];

export const Home = () => (
  <main className={styles.container}>
    <div className={styles.layout}>
      <section id="inicio" className={styles.primaryCards}>
        <div className={`${styles.hero} ${styles.heroMega}`}>
          <div className={styles.heroInner}>
            <div className={styles.heroContent}>
              <h1 className={styles.heroText}>
                Assista junto, mesmo à distância.
              </h1>
              <div className={styles.subText}>
                Compartilhe sua tela, sincronize vídeos e converse com seus
                amigos em uma sala privada. Sem instalar nada.
              </div>
              <NewRoomButton size="xl" roomTitle="" />
            </div>
          </div>
        </div>
      </section>

      <section id="recursos" className={styles.carouselSection}>
        <div className={styles.carouselHeader}>
          <h2>O essencial para a sessão</h2>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <Feature key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <section className={styles.howItWorks} aria-labelledby="como-funciona">
        <h2 id="como-funciona">Comece em segundos</h2>
        <div className={styles.stepsGrid}>
          {["Crie uma sala", "Envie o convite", "Escolha o que assistir"].map(
            (step, index) => (
              <div key={step} className={styles.howItWorksCard}>
                <span>{index + 1}</span>
                <h3>{step}</h3>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  </main>
);

const Feature = ({
  Icon,
  text,
  title,
}: {
  Icon: React.ForwardRefExoticComponent<IconProps>;
  text: string;
  title: string;
}) => (
  <article className={styles.featureCard}>
    <Icon size={44} />
    <h3 className={styles.featureTitle}>{title}</h3>
    <p className={styles.featureText}>{text}</p>
  </article>
);
