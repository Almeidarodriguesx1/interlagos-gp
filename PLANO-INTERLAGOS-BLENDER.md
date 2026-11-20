# Interlagos no Blender — plano de produção

Primeira entrega jogável proposta: sair do grid com 22 carros, passar pelo muro dos boxes, frear para o S do Senna e alcançar a Curva do Sol. Trabalhar nesse trecho até que a forma da pista, o comportamento do carro e a posição dos sons contem a mesma história.

## 1. Levantamento e escala

A configuração atual em src/sim/track.ts usa 4.309 m de comprimento e ajusta a altitude para uma amplitude de 43 m. Os pontos de controle declaram largura total simétrica de 16,8 a 19,5 m. A Prefeitura informa 4.309 m, largura de 12 a 15 m e aproximadamente 56 m de desnível. Essas referências globais não determinam o perfil de uma curva. Usar a numeração esportiva T1–T15 do evento em toda a produção.

- Sobrepor planta FIA, ortofoto datada e eixo do jogo em coordenadas métricas locais. Registrar origem, orientação e erro de alinhamento em pontos de controle distribuídos pelo circuito. Usar informação altimétrica com origem conhecida. Manter lacunas identificadas.
- Ficha por curva: progressiva de entrada, ápice e saída, bordas independentes, altitude, inclinação transversal, zebra, piso de escape, barreira e distância até a borda. Registrar fonte, data, precisão e status de cada campo.
- Capturar o mesmo enquadramento no simulador e no onboard. Conferir posição dos olhos, FOV vertical, formato da tela, distância dos muros e tamanho aparente de outro carro antes de corrigir a largura.
- Aceite proposto: volta fechada a até 1 m do comprimento de referência, sem degraus nas emendas; cada medida atribuída a uma fonte ou marcada como estimativa. Investigar larguras fora da faixa publicada em vez de truncá-las.

[Prefeitura — ficha da pista](https://prefeitura.sp.gov.br/web/autodromodeinterlagos/pistaoficial) · [FIA — planta do GP de São Paulo de 2026 e pit lane](https://www.fia.com/system/files/decision-document/2026_sao_paulo_grand_prix_-_competition_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_and_red_zone.pdf)

## 2. Produção do primeiro trecho

1. Criar interlagos-master.blend em metros, com coleções para referências, bordas, pisos, zebras, terreno, estruturas, marcadores de áudio e colisores. Fixar uma única transformação de eixos para o jogo.
2. Construir a superfície dirigível a partir das duas bordas e das seções de altura. Exportar do mesmo traçado os dados de superfície para física, IA, partículas e áudio. Manter identificadores de segmentos nas duas exportações.
3. Modelar em baixa resolução o pit wall, fachada, arquibancada e alambrado. Comparar planta e silhueta em cockpit e T-Cam antes dos materiais. Conferir bases contra o terreno e interferências contra a área dirigível.
4. Produzir no Blender os módulos reutilizáveis de barreira, cerca, placa, assentos, público e vegetação. Guardar os originais em biblioteca vinculada e as posições na cena de cada circuito. As estruturas que definem a silhueta de Interlagos têm geometria própria.
5. Gerar renders de revisão em planta, cockpit e câmera de pista. Exportar GLB por setor, com malhas repetidas instanciáveis, materiais PBR e colisores simplificados separados. Comparar Blender e navegador com a mesma posição de câmera.
6. Aprovar seco e molhado. Exigir zero objetos atravessando a pista, zero arquibancadas suspensas e correspondência entre pneu, piso identificado e som. Preservar o timbre da zebra já aprovado.

## 3. Jogabilidade

Antes e depois do primeiro trecho, repetir a mesma entrada gravada a 180 Hz e medir velocidade, pressão de freio, ângulo de direção, aceleração lateral, patinagem, inclinação e tempo por trecho. Usar também poucas voltas manuais com teclado e controle: tempo de resposta, zona morta e suavização podem explicar uma dificuldade que o teste da IA não revela. Comparar frenagem na T1, transição T1–T2 e tração na saída da T3. Ajustar um grupo de parâmetros por vez. Cronometrar quadro típico e percentil 95 na mesma máquina, câmera, resolução e condição com os 22 carros.

## 4. Áudio por evento e posição

| Camada | Implementação e aceite |
|---|---|
| Largada (STR) | Associar ao estado real de largada e usar gravações. Bip opcional de assistência. Testar apagar das luzes, pausa e reinício; uma emissão por evento. |
| Rádio (RAD) | Gravações com abertura, voz e fechamento em canal próprio. Fila curta com prioridade, volume e legendas. Testar rádio pré-largada e chegada sem sobreposição nem repetição ao retomar. |
| Público (AMB) | Emissores por setor de arquibancada, distância à câmera e variações gravadas. Na TV fixa, torcida permanece no setor quando o carro se afasta. |
| Pista e clima | Passagens seguem o rival, água e spray respondem à velocidade e ao contato da roda. Comparar seco, molhado, cockpit e externa; testar sem duplicar Doppler. |
| Motores por equipe | Cadastrar gravações identificadas por carro, sessão, carga e perspectiva. Aprovar cockpit e externa separadamente. |

O catálogo é um índice de referências. Inventariar os arquivos efetivamente disponíveis, registrar origem e edição e marcar eventos sem gravação como pendentes. Usar somente gravações conforme a preferência definida. Meta herdada de áudio: 10–25 MB comprimidos e menos de 64 MB decodificados; carregar só os bancos necessários e medir a memória real.

## 5. Expansão

Depois da aprovação da reta e T1–T3, seguir pela Reta Oposta e Descida do Lago, depois Ferradura, miolo, Mergulho e Junção, por fim a subida até a reta. Em cada lote entregar arquivo Blender editável, renders de comparação, setor GLB e relatório das diferenças jogáveis. Repetir a volta completa em seco e chuva com 22 carros e verificar tempos, consumo de memória e estabilidade após reinício. A biblioteca de módulos segue então para outros mapas. O serviço de pit stop fica fora desta sequência.
