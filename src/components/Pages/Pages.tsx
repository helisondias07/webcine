import React from "react";

const pageStyle: React.CSSProperties = {
  width: "min(860px, calc(100vw - 32px))",
  margin: "32px auto 80px",
  color: "var(--text-main)",
  lineHeight: 1.6,
};

const mutedStyle: React.CSSProperties = {
  color: "var(--text-muted)",
};

const sectionStyle: React.CSSProperties = {
  marginTop: 28,
};

const listStyle: React.CSSProperties = {
  paddingLeft: 22,
};

const Page = ({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) => (
  <main id="conteudo" style={pageStyle}>
    <h1>{title}</h1>
    <p style={mutedStyle}>{description}</p>
    {children}
  </main>
);

export const Privacy = () => {
  return (
    <Page
      title="Política de privacidade"
      description="Como o WebCineTV lida com contas, salas, cookies e dados de uso."
    >
      <section style={sectionStyle}>
        <h2>Salas</h2>
        <ul style={listStyle}>
          <li>
            Por padrão, salas são temporárias e expiram após um dia de
            inatividade.
          </li>
          <li>
            Usuários podem tornar uma sala permanente e desfazer essa escolha a
            qualquer momento.
          </li>
          <li>Não mantemos registros do conteúdo assistido pelos usuários.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>Informações pessoais</h2>
        <ul style={listStyle}>
          <li>Você não precisa criar conta para usar o serviço.</li>
          <li>
            Não vendemos ou compartilhamos informações pessoais com terceiros.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>Cookies e YouTube</h2>
        <ul style={listStyle}>
          <li>
            Usamos serviços como Google Analytics para medir uso; eles podem
            armazenar cookies ou dados locais no dispositivo.
          </li>
          <li>
            Ao usar busca e reprodução do YouTube, dados podem ser tratados
            conforme a{" "}
            <a href="https://policies.google.com/privacy">
              Política de Privacidade do Google
            </a>
            .
          </li>
        </ul>
      </section>
    </Page>
  );
};

export const Terms = () => {
  return (
    <Page
      title="Termos de uso"
      description="Condições para usar o WebCineTV e criar salas para assistir vídeos com outras pessoas."
    >
      <section style={sectionStyle}>
        <h2>Uso do serviço</h2>
        <ul style={listStyle}>
          <li>Você declara ter mais de 13 anos de idade.</li>
          <li>
            O uso pode ser encerrado em caso de compartilhamento de conteúdo
            ilegal ou infrator.
          </li>
          <li>O serviço não oferece garantia de disponibilidade contínua.</li>
          <li>
            Você usa o serviço por sua própria conta e risco, inclusive quanto a
            conteúdos criados ou compartilhados por terceiros.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>YouTube</h2>
        <ul style={listStyle}>
          <li>
            Ao usar a busca do YouTube, você também concorda com os{" "}
            <a href="https://www.youtube.com/t/terms">
              Termos de Serviço do YouTube
            </a>
            .
          </li>
        </ul>
      </section>
    </Page>
  );
};

export const FAQ = () => {
  return (
    <Page
      title="Perguntas frequentes"
      description="Dúvidas comuns sobre áudio, tamanho de salas e links para criar salas no WebCineTV."
    >
      <section style={sectionStyle}>
        <h2>Por que não sai áudio no compartilhamento de tela?</h2>
        <p>
          Para compartilhar áudio, use Chrome ou Edge e compartilhe uma aba ou a
          área de trabalho.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Existe limite de pessoas em uma sala?</h2>
        <p>
          Atualmente não existe um limite fixo, mas o serviço ainda não foi
          testado com salas muito grandes. Compartilhamento de tela e arquivos
          dependem do envio de uma pessoa para as outras, então podem perder
          qualidade em grupos maiores.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Posso criar uma sala com vídeo predefinido?</h2>
        <p>
          Sim. Use um link no formato <code>/create?video=URL_DO_VIDEO</code>{" "}
          para abrir uma sala com o vídeo informado.
        </p>
      </section>
    </Page>
  );
};
