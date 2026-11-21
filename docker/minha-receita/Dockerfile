# Base própria da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
#
# O minha-receita original (MIT, codeberg.org/cuducos/minha-receita) numa versão
# fixa, com os patches da plataforma em patches/:
#   0001 filtro da carga: só grava as UFs e situações cadastrais escolhidas
#        (MR_FILTRO_UFS, MR_FILTRO_SITUACOES), para a base caber no disco;
#   0002 serviço de controle: comando `controle`, que a API da plataforma usa
#        para ver o estado e disparar a carga (Administração > Base da Receita);
#   0003 download resiliente: conexões, tentativas e espera pelo ambiente
#        (MR_DOWNLOAD_*), porque o servidor da Receita oscila;
#   0004 rejeição do firewall: sob carga, a Receita responde 200 com a página
#        "Request Rejected" no lugar do pedaço do arquivo, e a biblioteca de
#        download (tangled.org/cuducos.me/chunk) gravava a página no zip. O
#        patch corrige a biblioteca em vendor/ — por isso o `go mod vendor`
#        antes do `git apply`;
#   0005 referências da plataforma: a carga recebe os pares código da Receita →
#        IBGE da tabela de municípios da plataforma (tabmun-plataforma.csv, lido
#        junto com o tabmun do Tesouro); GET /referencias e GET /ceps entregam
#        as tabelas da Receita e os CEPs da base para a plataforma.
#
# Atualizar o original: trocar MR_COMMIT e conferir se os patches ainda aplicam
# (o build falha no `git apply` se não aplicarem) e se os testes passam.
ARG GOLANG_VERSION=1.27.4

FROM golang:${GOLANG_VERSION}-trixie AS build
ARG MR_REPO=https://codeberg.org/cuducos/minha-receita.git
ARG MR_COMMIT=3a2c502d9d13ee5298c2642ab40f47f2e2c9a327
WORKDIR /minha-receita
RUN git -c core.autocrlf=false clone "${MR_REPO}" . && git checkout --quiet "${MR_COMMIT}"
# Contexto do build: a raiz do repositório (como o publish.ps1 constrói as outras).
COPY docker/minha-receita/patches/ /patches/
RUN go mod vendor
RUN git -c core.autocrlf=false apply --whitespace=nowarn /patches/*.patch
# Os testes do filtro e os do pacote de carga original: um patch que quebre a
# carga não chega a virar imagem.
RUN go test ./transform/ ./download/ && go test ./cmd/ -run "ConferirZip|VerificarZips|Baixar|EnvDownload|Tabmun|Carga|Referencias"
RUN CGO_ENABLED=1 go build -o /usr/bin/minha-receita
# Diretório dos arquivos baixados, gravável pelo usuário sem privilégio da
# imagem final (o volume nomeado herda dono e permissão na primeira montagem).
RUN mkdir -p /out/dados

FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=build /usr/bin/minha-receita /usr/bin/minha-receita
COPY --from=build --chown=65532:65532 /out/dados /dados
# Os temporários da carga (~15 GB) vão para o volume, não para a camada do contêiner.
# O progresso do download em partes também: no volume, a limpeza da carga o
# apaga junto com os zips, e nenhum progresso velho sobrevive de uma carga a outra.
ENV TMPDIR=/dados MR_DADOS_DIR=/dados CHUNK_DIR=/dados/.chunk
ENTRYPOINT ["/usr/bin/minha-receita"]
CMD ["api"]
