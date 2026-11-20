# Plano de execução do simulador

**Ordem de entrega.** fechar Interlagos com o grid atual, melhorar um cockpit, atualizar as carrocerias em lotes e, por último, levar o processo a Monza e Spa. Cada fase termina com uma versão verificável e uma lista curta de pendências antes de seguir.

## Base da qual partimos

O simulador web já tem 11 equipes jogáveis, 22 carros em corrida, troca de nível de detalhe dos rivais, câmeras de cockpit e T-Cam, áudio gravado, instalações decorativas nos boxes e física a 180 Hz. O [trecho 1 editável no Blender](../../Interlagos-Trecho-1/Interlagos-Trecho1.blend) já inclui terreno derivado de LiDAR, reta dos boxes, S do Senna, Curva do Sol, arquibancadas A e D, telas e áreas de escape. As larguras e alguns posicionamentos ainda são estimativas. O GLB de revisão tem cerca de 481 mil triângulos declarados e 27 MiB. Será a fonte de arte e comparação para derivar os setores usados na corrida.

A base atual passou em 76 testes, na geometria dos três circuitos e na checagem de posicionamento do cenário. O benchmark solo registrou aproximadamente 81,86 s por volta em Interlagos no seco e 93,23 s no molhado em modo Competitivo. Na frenagem de 325 a 123 km/h, percorreu 121,28 m no seco e 149,53 m no molhado. Esses números descrevem a versão do jogo e servem para comparar mudanças sob as mesmas condições. A referência real de comportamento exige telemetria compatível com carro, pista, condição e ponto de medição.

Consulte o [inventário dos quatro pacotes](../../referencias-simuladores/inventario.json) e a [auditoria de reaproveitamento](../../referencias-simuladores/PLANO-REAPROVEITAMENTO.md) para versões, arquivos e proveniência.

## Fases e critérios de aceite

| Fase | Entrega | Dependência | Marco de aceite |
|---|---|---|---|
| **0. Registrar a versão atual** | Guardar benchmark, cargas de rede, tempo de quadro e capturas em circuito, cockpit e T-Cam. Registrar desempenho em volta solo e largada com 22 carros. Criar cadastro dos assets candidatos com hash, origem, autor, licença e versão. | Versão atual do simulador e inventário existente. | Testes existentes passam. Há uma sessão de comparação repetível com o mesmo clima, câmera, máquina e resolução. |
| **1. Calibrar Interlagos e integrar T1–T3** | Alinhar eixo, largada, bordas e cotas. Derivar do Blender um pacote leve para a reta dos boxes ao fim da Curva do Sol. Aplicar asfalto PBR existente, barreiras, telas, zebras, escape, pit wall e A/D. Ligar o trecho ao restante da volta atual por emendas compatíveis. | Baseline e fontes alinhadas ao mesmo sistema de coordenadas. | Sobreposição em planta com erros registrados, T-Cam comparada com onboard, emendas sem degrau perceptível, carro alinhado à borda e classificação correta do piso sob as quatro rodas. Uma volta completa permanece possível. |
| **2. Fechar o cenário da volta** | Estender a calibração pela Reta Oposta e Descida do Lago, depois Ferradura, miolo, Junção e Subida dos Boxes. Posicionar os módulos já feitos. Completar fachadas, arquibancadas, alambrados, gramados, taludes, placas e horizonte conforme visibilidade na corrida. | Fluxo Blender → GLB → simulador validado na fase 1. | Nenhum footprint invade a área dirigível. Apoios chegam ao terreno. Muros e linhas visuais coincidem com os pontos de contato e limites de pista. Uma corrida com 22 carros completa a volta em seco e molhado. |
| **3. Fechar dirigibilidade e áudio de Interlagos** | Ajustar resposta ao volante, teclado e controle, frenagem, transição de direção e aderência por piso. Integrar público, rádio, largada e passagens gravadas. Ajustar as perspectivas cockpit e externa. | Volta e mapa de superfícies da fase 2. | Repetir entrada gravada para comparar frenagem T1, mudança T1–T2 e tração T3. Revisar a volta manual nos dois climas. Pneu, físico, partículas e áudio reconhecem o mesmo piso. Eventos de largada e rádio passam pelos testes de pausa e reinício sem duplicação. |
| **4. Melhorar um cockpit e escolher a carroceria piloto** | Adaptar volante AM26 de DeX a um carro existente. Conectar giro, display, marcha e LEDs. Comparar F226, RB22 e o carro atual sob as mesmas câmeras e iluminação. O F226 pode servir como variante alternativa ou referência de peças. | Interlagos completo e arte dos carros com proveniência registrada. | T-Cam, cockpit e Chase enquadram o carro. Esterço, giro de roda, volante, câmera e HUD funcionam sem folgas ou interseções visíveis. O comparativo inclui triângulos, render, memória e tempo de quadro. |
| **5. Atualizar o grid em lotes** | Aplicar as melhorias aprovadas em dois ou três carros por lote. Reaproveitar hierarquia, cockpit, materiais e peças de geometria compatível. Ajustar silhueta, pintura, número e capacete por equipe e piloto. Usar gravações específicas por equipe conforme disponibilidade e aprovação. | Um modelo piloto aprovado com fluxo Blender e níveis de detalhe reproduzíveis. | Todos os 11 carros continuam selecionáveis e o grid tem 22 entradas. Rodas, colisores, telas, âncoras, LODs e números funcionam sob carga. Sem sons compartilhados apresentados como gravação específica da equipe. |
| **6. Levar para outras pistas** | Adaptar um trecho de Monza primeiro, com Spa em seguida. Reutilizar componentes e regras de colocação, usando geometria, relevo, edifícios e paisagem próprios de cada circuito. | Interlagos fechado e exportador documentado. | Uma pista adicional aceita o mesmo contrato de dados e render. Volta, cronômetro, IA, superfícies, áudio e replays funcionam nos circuitos existentes e na cena nova. |

O serviço jogável de pit stop fica fora dessas fases. Os boxes recebem equipamentos, fachada, sinalização, muro e áudio ambiente onde houver gravação.

## Implementação detalhada de Interlagos

### Dados e Blender

1. Usar a planta FIA, ortofoto, terreno GeoSampa, traçado do ZIP AgentiLoop e CSV da TUM para marcar linha de chegada, pontos de tangência e ápices. O CSV de estações enviado para o Blender tem XYZ zerado e pode alimentar nomes de setores, intenções de superfície e larguras preliminares. Seus campos precisam de fonte ou marca de estimativa antes de virar geometria.
2. Registrar o referencial em metros, a origem no Blender e a transformação para Three.js. Conferir se os lados esquerdo e direito acompanham o sentido da volta, em especial nas linhas da TUM. Comparar largura de asfalto entre bordas com zonas de zebra, escape e barreira separadas.
3. Converter amostras calibradas ao contrato atual de `TrackSample` com progressiva, posição, tangente, inclinação, curvatura, larguras independentes e marcações. Produzir perfis de parede e superfícies do mesmo conjunto de dados. A progressiva e os IDs dos segmentos unem referências, colliders, som e malha.
4. Derivar do .blend editável setores GLB com origem comum, nomes estáveis, colisores simplificados, malhas estáticas agrupadas e vegetação e cadeiras repetidas como instâncias onde fizer sentido. O terreno de revisão já contém áreas aproximadas e dados interpolados. Documentar a evidência ampliada por trecho.
5. Exportar inicialmente a reta dos boxes até a saída da T3. Medir a continuidade de posição, tangente e inclinação ao religar com a pista atual. Se os eixos divergirem, corrigir as emendas e o referencial antes de ativar a nova geometria na corrida. Uma opção de desenvolvimento permite comparar as duas versões.
6. Versionar a geometria junto ao cronômetro para preservar a interpretação de antigos recordes. Um ghost gravado em traçado diferente só aparece se houver compatibilidade explícita.

| Setor de produção | Modelar e reaproveitar | Checagem |
|---|---|---|
| Reta dos boxes, S do Senna e Curva do Sol | Arquibancadas A/D, escadas e cobertura, pit wall, boxes, ferragens, pintura do grid, frenagem da T1, zebras e escapes. Usar o .blend existente como ponto de partida. | Planta e onboard da freada. Conferir visibilidade da T2 no cockpit, distância dos muros, localização do escape e saída para a reta. |
| Reta Oposta e Descida do Lago | Reaproveitar cercas, placas de frenagem, barreiras, vegetação e módulos de material. Calibrar taludes, zebra e escape pelas referências do local. | Fronteiras de asfalto visíveis, distância de freada, transição de relevo e posicionamento das proteções. |
| Ferradura, Laranjinha e miolo | Reaproveitar peças de arquibancada, talude, alambrado e placas. Ajustar módulos de público e vegetação aos footprints, inclusive o setor OTC quando a referência confirmar. | Conferir silhuetas e apoios, visibilidade em subida e camber nas entradas. |
| Mergulho, Junção e Subida dos Boxes | Usar LiDAR para fechar perfil vertical. Reaproveitar muros, postes, sinalização e módulos do pit lane. Amarrar à reta no fechamento da volta. | Verificar transição vertical sob carga, tração na Junção, retorno ao grid e reentrada no circuito. |

### Pontos de integração

| Subsistema existente | Aproveitamento |
|---|---|
| `src/sim/track.ts`, `src/sim/types.ts` | Preservar o contrato de projeção em pista e adaptar o carregamento do eixo e das bordas. As consultas atuais continuam a alimentar física, câmera e IA. |
| `src/sim/surfaceModel.ts`, `src/sim/surface-zones.json`, `src/audio/surfaces.ts` | A classificação compartilhada já existe. Preencher zonas por trecho e reconciliar geometria visual, contato por roda, atrito e áudio dentro desse fluxo. |
| `src/engine/trackBuilder.ts`, `src/engine/sceneryPlacement.ts`, `src/engine/pitEquipment.ts` | Integrar terreno e GLBs por setor, reutilizar testes de clearance e apoios e preservar instâncias do equipamento de box. Remover a dupla representação só nos setores migrados e garantir a liberação de recursos na troca de circuito. |
| `src/engine/F1Renderer.ts`, `src/engine/cameraRig.ts` | Manter a câmera na unidade em metros. Capturar enquadramentos comparáveis. Verificar corrida, contrarrelógio e troca de circuito. |
| `src/engine/mcl40Pilot.ts`, `src/sim/vehicleStudies.ts`, `src/engine/rivalLodGrid.ts`, `src/sim/grid2026.ts` | Adaptar o volante e as malhas ao contrato já usado pelo carro jogador e pelos rivais. Padronizar pivôs, corpo e âncoras no Blender antes de exportar. |
| `src/audio/RecordedAudioEngine.ts`, `public/audio/fontes-e-edicoes.json` | Continuar com gravações. Posicionar torcida e passagens em três dimensões. Associar eventos a troca de marcha, largada, rádio e transição de superfície. Registrar autor, origem, edição e condição de gravação. |
| `src/sim/fixedStep.ts`, `src/sim/physics.ts`, `scripts/benchmark-dynamics.ts` | Conservar o clock de 180 Hz durante a calibração de Interlagos. Medir resposta a cada mudança antes de alterar o modelo inteiro. Avaliar 6-DOF ou force feedback em um ensaio separado. |

### Política de reaproveitamento por fonte

- **AgentiLoop.** Usar Interlagos como referência executável. Aplicar os mapas PBR do asfalto da Poly Haven e reutilizar as posições ambientais a partir das fontes identificadas quando adequadas. Para código autoral da AgentiLoop, confirmar autorização ou licença da revisão antes de portar módulos. A licença de Three.js vendorizado já é independente.
- **Interactive F1.** Aproveitar trechos MIT de apresentação ou processamento que caibam no renderer atual, com aviso de copyright. Comparar modelos identificados em CC BY 4.0 depois de verificar créditos e dependências de decodificação. Registrar alterações no Blender e manter os decalques com proveniência própria.
- **LibreCorsa.** Testar o volante DeX CC BY 4.0. Usar o simulador como referência de sensação ao dirigir, sem fundir o motor físico. Uma eventual adoção de código deve escolher revisão com licença confirmada e revisar o efeito no projeto web. O banco de áudio de mod continua apenas como referência técnica de mix.
- **TUM.** Usar eixo e larguras como comparação independente. A largura estimada e a linha ideal calculada precisam de validação visual e física. Registrar origem OSM, processamento e licença do conjunto ao redistribuir dados derivados.
- **Assets do nosso projeto.** Usar primeiro o terreno LiDAR, o .blend da T1, os equipamentos de box, a grama instanciada, os materiais e os LODs já disponíveis. Criar uma peça quando a biblioteca não oferece geometria apropriada ou a diferença de silhueta é relevante na câmera do jogo.

## Verificação em cada entrega

- Rodar `npm run lint`, `npm test`, `npm run build`, `npm run check:geom` e `npm run check:scenery`. Repetir `npm run benchmark:dynamics` quando mudar geometria dirigível, superfícies ou física.
- Validar cada GLB e conferir escala, materiais, orientação, malhas e memória no navegador. Comparar a mesma largada com 22 carros em seco e chuva. Medir p95 de tempo de quadro e bytes carregados. Usar como limite inicial de investigação aumento acima de 10% no p95 ou crescimento de memória que se repita a cada reinício. Esses critérios são propostas de comparação, sujeitos ao hardware de teste.
- Nas pistas, escolher pontos de controle independentes dos usados no alinhamento. Fazer captura superior e em T-Cam nos mesmos pontos, conferir piso por roda e testar no seco e molhado. Registrar erros e estimativas de campo no manifesto.
- No áudio, verificar motor ligado e desligado, troca manual, zebra, brita, chuva, passagem, pausa, reinício e modos de câmera. Usar a meta herdada de 10–25 MB comprimidos e até 64 MB decodificados como referência e medir o carregamento por sessão.
- Fechar cada fase com versão jogável, comparativo antes/depois, arquivos alterados, créditos dos assets, números medidos e próximo lote. Reabrir só o ponto que falhou. Isso evita reavaliar a coleção de ZIPs a cada etapa.

## Primeiro lote para execução

1. Produzir a ficha de calibração da reta dos boxes e T1–T3 com os marcos da planta e os desvios entre o traçado atual, a TUM e o .blend.
2. Corrigir a borda e o relevo onde a evidência sustentar a mudança. Extrair do .blend a geometria necessária para a primeira versão e aplicar os mapas de asfalto já disponíveis.
3. Integrar no simulador com as emendas verificadas e as zonas do trecho vinculadas ao áudio existente. Entregar link local, render superior, T-Cam e medições de geometria e carregamento.
4. Usar esse trecho para aprovar o padrão de exportação. Então replicar o processo para o restante de Interlagos e seguir para o cockpit e o grid após fechar a volta.
