# MCL40 v0.2 — editar no Blender e colocar no jogo

## Testar agora

O modelo já foi instalado no projeto web desta máquina, apenas para o carro do jogador. Com o servidor desta entrega ativo, abra:

**http://127.0.0.1:3011/?car=mcl40**

Clique para iniciar a corrida e experimente Cockpit, T-Cam e Chase. `W/A/S/D` dirigem; `I` liga/desliga o motor; `T` alterna automático/manual; `E` sobe marcha e `Q` reduz no modo manual. Use os controles já existentes de áudio e clima do jogo.

Se o servidor estiver fechado, abra o Terminal e execute:

```bash
cd "/Users/josearmandorodriguesdealmeida/Documents/Codex/2026-11-17/est/outputs/interlagos-audio-atualizado"
npm run dev -- --port 3011 --host 127.0.0.1 --strictPort
```

Mantenha esse Terminal aberto. Se a porta já estiver em uso pelo mesmo jogo, basta abrir o endereço. Para usar outro servidor/porta, acrescente `?car=mcl40` ao endereço dele.

O endereço sem `?car=mcl40` continua utilizando o piloto anterior. O grid de adversários permanece como estava. Você não precisa substituir `pilot-v8.glb` nem converter os demais carros.

## 1. Abrir a versão correta no Blender

Abra **MCL40-refinado-v02.blend** nesta pasta. O estudo anterior continua preservado na pasta original `mcl40-blender`.

Se tiver alterações ainda não salvas no Blender antigo (asterisco no título), salve-as em outra cópia antes de abrir o novo arquivo. Esta entrega não capturou alterações que existiam somente na memória do Blender.

Na coleção `01 MCL40 - editable vehicle`, os principais objetos são:

| Parte | Objetos |
|---|---|
| Braços da suspensão | `SuspLink_FL_*`, `SuspLink_FR_*`, `SuspLink_RL_*`, `SuspLink_RR_*` |
| Fixações da suspensão | `Anchor_*`, `Upright_FL/FR/RL/RR` |
| Volante e instrumentos | `SteeringWheel`, `OLED`, `Steering_Button*`, `Steering_Rotary*`, `LED_00` a `LED_14` |
| Frente e traseira | `FrontWing`, `FrontFlap_0/1`, `RearWing`, `RearFlap` |
| Assoalho | `Floor_Main`, `Floor_CentralPlank`, `Floor_ForwardFence_*`, `Diffuser_Vane*` |
| Rodas | `Wheel_FL/FR/RL/RR`, com pivôs `Steer_*` |

Os cubos, suportes e pinças ficam fora dos objetos que giram com os pneus. As conexões da suspensão usam os pontos `Anchor_*`. Preserve esses nomes, a hierarquia e os dados personalizados ao editar.

As linhas pretas pontilhadas das capturas eram, em grande parte, linhas de parentesco e auxiliares do Blender. Na nova versão, esses auxiliares estão ocultos na viewport. Para ajustar manualmente, use a seta ao lado de **Viewport Overlays**, no topo da área 3D, e desative **Relationship Lines** e **Extras**. Isso altera a visualização; não apaga peças do carro.

## 2. Editar e salvar

Salve uma cópia de trabalho do `.blend`. Faça alterações em Object Mode ou Edit Mode, mantendo escala em metros e a orientação: Z para cima e frente em -Y no Blender.

Ao mudar um braço, mantenha suas extremidades nas fixações. Ao mover uma fixação, revise a montagem e revalide no jogo. Não una rodas, pinças, braços móveis ou abas das asas à carroceria inteira. O otimizador faz o agrupamento permitido para a versão de execução.

## 3. Exportar o carro aberto

No Blender, mude uma área para **Text Editor**, escolha **Open**, abra:

`scripts/export-open-model.py`, dentro desta pasta, e clique em **Run Script**.

O script exporta somente a coleção do veículo para **exports/mcl40-study.glb**. Estúdio, câmeras, luzes e referências ficam de fora. Também preserva o tom das inscrições e o modo de transparência usado pelas aplicações.

O script `refine-details.py` reconstrói o refinamento a partir da base; não o execute para exportar edições manuais. Para exportar seu trabalho atual, use `export-open-model.py`.

## 4. Otimizar e validar

No Terminal:

```bash
cd "/Users/josearmandorodriguesdealmeida/Documents/Codex/2026-11-17/est/outputs/mcl40-refinado-v02"
npm run optimize
npm run validate
```

Se esta pasta tiver sido extraída do ZIP em outro local, execute `npm ci` uma vez antes desses comandos. Nesta máquina, as ferramentas já estão disponíveis.

O otimizador produz **exports/mcl40-runtime.glb**, preservando as matrizes dos pivôs, as fixações e os 24 braços articulados. O validador precisa indicar **errors: 0** e **warnings: 0**. Mensagens informativas são mantidas no relatório JSON.

## 5. Instalar no projeto

Ainda no Terminal da pasta do kit:

```bash
npm run game:install
```

Isso copia o GLB validado para **public/models/mcl40-v02.glb** do projeto atualizado. O script verifica a exportação e exige que a integração `mcl40Pilot.ts` esteja presente.

Se o projeto estiver em outro lugar, informe a pasta:

```bash
npm run game:install -- "/caminho/para/a/pasta/do/jogo"
```

Para outra máquina, use o ZIP do jogo atualizado desta entrega e reinstale as dependências do jogo com `npm ci`. Copiar apenas o GLB para um jogo antigo não adiciona o adaptador das peças móveis.

## 6. Conferir a atualização

Atualize a página com `?car=mcl40`. Se necessário, faça uma recarga completa do navegador. Confira:

- Pintura papaya e novo volante, sem recoloração automática para o preset do jogador.
- Instrumentos legíveis e atualizados, sem imagem de cabeça para baixo.
- Rodas girando e esterçando; pinças e suportes sem girar junto com o aro.
- Braços mantendo contato com carroceria e cubos ao frear e esterçar.
- Cockpit, T-Cam e Chase; comportamento depois de reiniciar e trocar de circuito.
- Seco e molhado; o mapa de chuva afeta a banda de rodagem sem substituir as inscrições laterais.

Diagnóstico opcional no console do navegador:

```js
window.interlagosPilot
```

Deve apresentar `ready: true` e `source: "McLaren MCL40 study v0.2"`. Se aparecer `ready: false`, confira o erro e a presença de `public/models/mcl40-v02.glb`.

## Escopo de realismo desta versão

A suspensão é uma reconstrução visual com articulação cinemática, sem simulação estrutural de flexão de cada peça. As formas e posições são estimativas por referências visuais, não CAD da equipe.

O carro do jogador usa o alvo de entre-eixos de 3,40 m e raio de roda de 0,363 m do estudo; os contatos de áudio acompanham suas rodas. Os demais carros mantêm a configuração anterior. Massa, aerodinâmica, colisores e regras esportivas continuam sendo aproximações do simulador. As abas dianteiras e traseira acompanham o comando aerodinâmico existente; isso não implementa integralmente o regulamento de 2026.

Patrocinadores e detalhes de carroceria ainda têm aplicações provisórias. A referência visual principal continua sendo o [lançamento oficial do MCL40](https://www.mclaren.com/racing/formula-1/2026/mclaren-racing-reveal-livery-for-the-mclaren-mastercard-formula-1-teams-2026-challenger/).
