import React, { useEffect, useMemo, useState } from "react";
import { ActionIcon } from "@mantine/core";
import {
  IconBrandYoutubeFilled,
  IconChevronLeft,
  IconChevronRight,
  IconFile,
  IconList,
  IconMessageFilled,
  IconScreenShare,
  type IconProps,
} from "@tabler/icons-react";
import { NewRoomButton } from "../TopBar/TopBar";
import styles from "./Home.module.css";
import { t } from "../../i18n";

function getCardsPerView() {
  if (window.innerWidth <= 760) {
    return 1;
  }
  if (window.innerWidth <= 1180) {
    return 2;
  }
  return 3;
}

function shouldSplitHeroOnMobile() {
  return window.innerWidth <= 980;
}

export const Home = () => {
  const featureCards = [
    {
      Icon: IconBrandYoutubeFilled,
      title: "YouTube",
      text: "Reproduza vídeos do YouTube através de links ou pesquise no WebCine.",
    },
    {
      Icon: IconScreenShare,
      title: "Screensharing",
      text: "Compartilhe aba do navegador ou tela inteira.",
    },
    {
      Icon: IconFile,
      title: "Arquivo",
      text: "Envie e transmita seus próprios arquivos direto do seu dispositivo.",
    },
    {
      Icon: IconMessageFilled,
      title: "Chat",
      text: "Converse com a galera durante a sessão.",
    },
    {
      Icon: IconList,
      title: t("playlist"),
      text: "Monte a ordem dos próximos vídeos em colaboração.",
    },
  ];

  const [cardsPerView, setCardsPerView] = useState(() => getCardsPerView());
  const [splitHeroOnMobile, setSplitHeroOnMobile] = useState(() =>
    shouldSplitHeroOnMobile(),
  );
  const [page, setPage] = useState(0);

  useEffect(() => {
    const onResize = () => {
      setCardsPerView(getCardsPerView());
      setSplitHeroOnMobile(shouldSplitHeroOnMobile());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const pages = useMemo(() => {
    const chunks: typeof featureCards[] = [];
    for (let i = 0; i < featureCards.length; i += cardsPerView) {
      chunks.push(featureCards.slice(i, i + cardsPerView));
    }
    return chunks;
  }, [cardsPerView]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, pages.length - 1)));
  }, [pages.length]);

  return (
    <main className={styles.container}>
      <div className={styles.layout}>
        <section id="inicio" className={styles.primaryCards}>
          {splitHeroOnMobile ? (
            <>
              <Hero
                heroText="Sua sala de cinema online."
                subText="Sem precisar instalar nada nem criar contas."
                action={<NewRoomButton size="xl" roomTitle="" />}
              />
              <Hero
                heroText="Assista e converse com seus amigos em tempo real!"
                subText="Play, pause e chat no mesmo ritmo para todo mundo de graça!"
              />
            </>
          ) : (
            <Hero
              mega
              heroText="Sua sala de cinema online, assista e converse com seus amigos em tempo real!"
              subText="Sem precisar instalar nada nem criar contas! Play, pause e chat no mesmo ritmo para todo mundo de graça!"
              action={<NewRoomButton size="xl" roomTitle="" />}
            />
          )}
        </section>

        <section id="recursos" className={styles.carouselSection}>
          <div className={styles.carouselHeader}>
            <h3>Recursos da plataforma</h3>
            <div className={styles.carouselControls}>
              <ActionIcon
                className={styles.carouselArrow}
                size="lg"
                variant="light"
                color="webgold"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Página anterior"
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
              <ActionIcon
                className={styles.carouselArrow}
                size="lg"
                variant="light"
                color="webgold"
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={page >= pages.length - 1}
                aria-label="Próxima página"
              >
                <IconChevronRight size={18} />
              </ActionIcon>
            </div>
          </div>

          <div className={styles.carouselViewport}>
            <div
              className={styles.carouselTrack}
              style={{
                transform: `translateX(-${page * 100}%)`,
              }}
            >
              {pages.map((cards, pageIndex) => (
                <div
                  key={`page-${pageIndex}`}
                  className={styles.carouselPage}
                  style={{
                    gridTemplateColumns: `repeat(${cardsPerView}, minmax(0, 1fr))`,
                  }}
                >
                  {cards.map((feature) => (
                    <Feature
                      key={`${pageIndex}-${feature.title}`}
                      Icon={feature.Icon}
                      title={feature.title}
                      text={feature.text}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div id="planos" className={styles.carouselDots}>
            {pages.map((_, i) => (
              <button
                key={`dot-${i}`}
                className={`${styles.dot} ${i === page ? styles.dotActive : ""}`}
                onClick={() => setPage(i)}
                aria-label={`Ir para página ${i + 1}`}
              />
            ))}
          </div>
        </section>

        <section className={styles.howItWorks} aria-labelledby="como-funciona">
          <h3 id="como-funciona">Como funciona</h3>
          <div className={styles.howItWorksGrid}>
            {[
              "Crie uma sala",
              "Convide seus amigos",
              "Assista junto em tempo real",
            ].map((step, index, all) => (
              <React.Fragment key={step}>
                <div className={styles.howItWorksCard}>
                  <span>{index + 1}</span>
                  <h4>{step}</h4>
                </div>
                {index < all.length - 1 && (
                  <div className={styles.howItWorksArrow} aria-hidden="true">
                    <span className={styles.howItWorksArrowDesktop}>→</span>
                    <span className={styles.howItWorksArrowMobile}>↓</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

const Hero = ({
  heroText,
  subText,
  action,
  mega,
}: {
  heroText?: string;
  subText?: string;
  action?: React.ReactNode;
  mega?: boolean;
}) => {
  return (
    <div className={`${styles.hero} ${mega ? styles.heroMega : ""}`}>
      <div className={styles.heroInner}>
        <div className={styles.heroContent}>
          <div className={styles.heroText}>{heroText}</div>
          <div className={styles.subText}>{subText}</div>
          {action}
        </div>
      </div>
    </div>
  );
};

const Feature = ({
  Icon,
  text,
  title,
}: {
  Icon: React.ForwardRefExoticComponent<IconProps>;
  text: string;
  title: string;
}) => {
  return (
    <div className={styles.featureCard}>
      <Icon size={58} />
      <h4 className={styles.featureTitle}>{title}</h4>
      <div className={styles.featureText}>{text}</div>
    </div>
  );
};
