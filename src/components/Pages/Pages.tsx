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
  <main style={pageStyle}>
    <h1>{title}</h1>
    <p style={mutedStyle}>{description}</p>
    {children}
  </main>
);

export const Privacy = () => {
  return (
    <Page
      title="Politica de privacidade"
      description="Como o WebCineTV lida com contas, salas, cookies e dados de uso."
    >
      <section style={sectionStyle}>
        <h2>Salas</h2>
        <ul style={listStyle}>
          <li>
            Por padrao, salas sao temporarias e expiram apos um dia de
            inatividade.
          </li>
          <li>
            Usuarios podem tornar uma sala permanente e desfazer essa escolha a
            qualquer momento.
          </li>
          <li>Nao mantemos registros do conteudo assistido pelos usuarios.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>Informacoes pessoais</h2>
        <ul style={listStyle}>
          <li>Voce nao precisa criar conta para usar o servico.</li>
          <li>
            Ao entrar com e-mail ou provedor de autenticacao, usamos nome e foto
            para identificar voce nas salas.
          </li>
          <li>Podemos usar essas informacoes para contato sobre o servico.</li>
          <li>Nao vendemos informacoes pessoais a terceiros.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>Cookies e YouTube</h2>
        <ul style={listStyle}>
          <li>
            Usamos servicos como Google Analytics para medir uso; eles podem
            armazenar cookies ou dados locais no dispositivo.
          </li>
          <li>
            Ao usar busca e reproducao do YouTube, dados podem ser tratados
            conforme a{" "}
            <a href="https://policies.google.com/privacy">
              Politica de Privacidade do Google
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
      description="Condicoes para usar o WebCineTV e criar salas para assistir videos com outras pessoas."
    >
      <section style={sectionStyle}>
        <h2>Uso do servico</h2>
        <ul style={listStyle}>
          <li>Voce declara ter mais de 13 anos de idade.</li>
          <li>
            O uso pode ser encerrado em caso de compartilhamento de conteudo
            ilegal ou infrator.
          </li>
          <li>O servico nao oferece garantia de disponibilidade continua.</li>
          <li>
            Voce usa o servico por sua propria conta e risco, inclusive quanto a
            conteudos criados ou compartilhados por terceiros.
          </li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2>YouTube</h2>
        <ul style={listStyle}>
          <li>
            Ao usar a busca do YouTube, voce tambem concorda com os{" "}
            <a href="https://www.youtube.com/t/terms">
              Termos de Servico do YouTube
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
      description="Duvidas comuns sobre audio, tamanho de salas e links para criar salas no WebCineTV."
    >
      <section style={sectionStyle}>
        <h2>Por que nao sai audio no compartilhamento de tela?</h2>
        <p>
          Para compartilhar audio, use Chrome ou Edge e compartilhe uma aba ou a
          area de trabalho.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Existe limite de pessoas em uma sala?</h2>
        <p>
          Atualmente nao existe um limite fixo, mas o servico ainda nao foi
          testado com salas muito grandes. Compartilhamento de tela e arquivos
          dependem do envio de uma pessoa para as outras, entao podem perder
          qualidade em grupos maiores.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2>Posso criar uma sala com video predefinido?</h2>
        <p>
          Sim. Use um link no formato <code>/create?video=URL_DO_VIDEO</code>{" "}
          para abrir uma sala com o video informado.
        </p>
      </section>
    </Page>
  );
};
