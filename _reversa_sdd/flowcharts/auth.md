# Fluxograma — Módulo `auth`

> Visão geral das rotas e para onde cada uma leva no service. Fluxogramas por função
> principal estão em arquivos separados (`auth-login.md`, `auth-refresh.md`, etc.).

```mermaid
flowchart TD
    A[POST /auth/login] --> S1[AuthService.login]
    B[GET /auth/empresa-branding] --> S2[AuthService.empresaBranding]
    C[POST /auth/refresh] --> S3[AuthService.refresh]
    D[POST /auth/logout] --> S4[AuthService.logout]
    E["GET /auth/me (JwtAuthGuard)"] --> S5[AuthService.me]
    F["POST /auth/switch-empresa (JwtAuthGuard)"] --> S6[AuthService.switchEmpresa]
    G["PATCH /auth/change-password (JwtAuthGuard)"] --> S7[AuthService.changePassword]
    H["PATCH /auth/me/primeiro-acesso (JwtAuthGuard)"] --> S8[AuthService.completeFirstAccess]
    I["POST /auth/me/foto (JwtAuthGuard)"] --> S9[AuthService.uploadOwnAvatar]
    J["PATCH /auth/me/avatar-padrao (JwtAuthGuard)"] --> S10[AuthService.selectDefaultAvatar]
    K["PATCH /auth/me (JwtAuthGuard)"] --> S11[AuthService.updateOwnProfile]
    L["PATCH /auth/me/rotina-inicial (JwtAuthGuard)"] --> S12[AuthService.updateRotinaInicial]

    S1 --> T1[buildAccessToken]
    S3 --> T1
    S6 --> T1
    T1 --> P[rotinaNoAr: poda por módulo/menu desligado]

    S8 --> S5
    S9 --> S5
    S10 --> S5
    S11 --> S5
    S12 --> S5
```
