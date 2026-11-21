# Base própria da Receita (docs/planos/2026-11-20-prospeccao-leads-receita.md).
#
# O minha-receita original (MIT, codeberg.org/cuducos/minha-receita) numa versão
# fixa, com dois patches da plataforma em patches/:
#   0001 filtro da carga: só grava as UFs e situações cadastrais escolhidas
#        (MR_FILTRO_UFS, MR_FILTRO_SITUACOES), para a base caber no disco;
#   0002 serviço de controle: comando `controle`, que a API da plataforma usa
#        para ver o estado e disparar a carga (Administração > Base da Receita).
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
RUN git -c core.autocrlf=false apply --whitespace=nowarn /patches/*.patch
RUN go mod download
# Os testes do filtro e os do pacote de carga original: um patch que quebre a
# carga não chega a virar imagem.
RUN go test ./transform/ ./download/ && go test ./cmd/ -run "ConferirZip|VerificarZips|Baixar|EnvDownload"
RUN CGO_ENABLED=1 go build -o /usr/bin/minha-receita
# Diretório dos arquivos baixados, gravável pelo usuário sem privilégio da
# imagem final (o volume nomeado herda dono e permissão na primeira montagem).
RUN mkdir -p /out/dados

FROM gcr.io/distroless/cc-debian13:nonroot
COPY --from=build /usr/bin/minha-receita /usr/bin/minha-receita
COPY --from=build --chown=65532:65532 /out/dados /dados
# Os temporários da carga (~15 GB) vão para o volume, não para a camada do contêiner.
ENV TMPDIR=/dados MR_DADOS_DIR=/dados
ENTRYPOINT ["/usr/bin/minha-receita"]
CMD ["api"]
