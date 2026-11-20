# Interlagos por curva — volta de classificação de 2018

Tempos aproximados no arquivo, em segundos desde o primeiro quadro. A volta cronometrada começa perto de 5,2 s e termina perto de 72,5 s (1:07.281 na transmissão). Amostra visual a cada segundo de um original a 50 fps. Esquerda e direita são do piloto. A câmera recorta as laterais e o halo encobre partes do piso. As janelas abaixo servem para localizar movimentos e marcos, não para cravar tangências topográficas. [Onboard da F1](https://www.youtube.com/watch?v=xyX6aNxL9SQ)

| Trecho | Vídeo (s) | Referência para reconstrução e revisão |
|---|---:|---|
| S1 — linha e freada | 5–9 | Quadriculado do grid, muro contínuo à direita, faixa clara junto à borda e pórtico antes da entrada. Alinhar horizonte e queda a partir da mesma altura de T-Cam. |
| T1 | 9–11 | Zebra interna à esquerda. A entrada é mais aberta que o ápice; verificar as duas bordas e a queda até a inversão. |
| T2 | 11–13 | Zebra à direita junto a superfície verde. O intervalo entre as duas zebras é uma referência melhor para a largura utilizável que uma captura isolada. |
| T3, Curva do Sol | 13–18 | Arco longo à esquerda com zebra interna; na saída o carro abre para a zebra direita e a área verde. Conferir a linha de reintegração dos boxes na planta. |
| Reta Oposta / divisão S1–S2 | 18–24 | Linha oblíqua à esquerda, pórtico e placas à direita à aproximação da freada. Transcrever valores só de quadros legíveis; posicionar longitudinalmente pela planta. |
| T4, Descida do Lago | 24–26 | Ápice à esquerda e saída à direita sobre zebra junto ao escape pintado. Verificar a transição do declive sem achatar a curva. |
| T5 | 26–30 | Segundo arco à esquerda, faixa interna à esquerda em 28 s. Modelar a abertura da saída antes da subida. |
| T6 | 31–34 | Placa à esquerda antes da mudança de direção. Zebra interna à direita durante a subida. |
| T7 | 34–37 | Continuação do arco à direita seguida da zebra externa à esquerda. Verificar o intervalo para reposicionar o carro antes da T8. |
| T8 | 37–40 | Entrada pelo lado esquerdo, ápice fechado à direita. Comparar o ângulo acumulado até soltar o volante e preparar a inversão. |
| T9, Pinheirinho | 40–45 | Arco prolongado à esquerda com zebra interna visível em vários quadros; abertura para a direita. Evitar concentrar toda a rotação em um ponto. |
| T10, Bico de Pato | 46–50 | Aproximação pela esquerda, marcas de pneus no asfalto e ápice tardio à direita. Prioridade de medição do raio e do espaço de saída. |
| T11, Mergulho | 51–55 | Zebra interna à esquerda acompanhando a descida; abertura em direção à faixa verde direita. Revisar visibilidade e concordância vertical. |
| Divisão S2–S3 / T12, Junção | 56–60 | Freada pelo lado direito, mudança para a esquerda e saída junto à zebra direita. Comparar o começo da subida e a posição do ápice com a etiqueta do simulador. |
| T13 | 60–63 | Saída em aceleração e subida; placas publicitárias à direita. Conferir quanto tempo a borda externa permanece ao alcance do carro. |
| T14 | 63–67 | Curva longa à esquerda, muro próximo na margem interna e pórtico mais adiante. Posicionar o muro pela planta e pelo afastamento local. |
| T15 / bifurcação dos boxes | 67–71 | A linha à esquerda se descola da trajetória de corrida e surge a faixa pintada junto ao separador. Usar também o início do vídeo (0–3 s) para uma segunda passagem. |
| Reta principal | 71–73 | Retorno às marcas do grid e linha de controle. A faixa de boxes precisa continuar atrás da divisória. |

## Escala e curvas que merecem teste

O eixo dirigível padrão medido por buildSurveyedInterlagos() tem **4.297,41 m**; a planta FIA de 2025 informa **4.309 m**. Diferença de **11,59 m (0,27%)**. Escalar tudo nessa proporção quase não mudaria a T10. Para reproduzir a auditoria, consulte eixo-simulador.csv, com distância acumulada, larguras esquerda/direita, curvatura de condução e coordenadas locais de cada amostra. [Mapa FIA e desenho do pit lane](https://www.fia.com/system/files/decision-document/2025_sao_paulo_grand_prix_-_event_notes_-_circuit_map_pit_lane_drawing_emergency_exits_map_quarantine_zone_and_red_zones_map.pdf)

| Etiqueta do jogo | Intervalo no eixo | Menor largura total | Menor raio equivalente de condução |
|---|---:|---:|---:|
| T1 | 375–443 m | 14,0 m | 28,9 m |
| T8 | 2.281–2.429 m | 13,1 m | 19,9 m |
| T9 | 2.507–2.605 m | 13,1 m | 27,9 m |
| T10 | 2.657–2.776 m | 13,0 m | 10,2 m |
| T12 | 3.094–3.213 m | 13,1 m | 355 m |

Raio equivalente = inverso do maior módulo de drivingCurvature no intervalo. É um indicador interno para triagem. O valor muito baixo na T10 e o valor alto na etiqueta T12 justificam conferir primeiro a posição do ápice e a correspondência dos nomes. O CSV do kit tem estações marcadas como estimadas e coordenadas zeradas em registros. A perspectiva do onboard tampouco fornece uma escala transversal confiável.

## Ordem de reconstrução

1. Registrar a linha de controle e pelo menos três marcos distribuídos pela volta em ortofoto métrica da temporada-alvo. Traçar ambas as bordas, calcular eixo e largura perpendicular e conferir marcos independentes antes de exportar o Blender.
2. Sobrepor primeiro T8–T10 e depois T12 em planta. Desenhar centro, bordas e trajetória de teste em cores separadas. Comparar raio e taxa de mudança de direção, depois percorrer entrada, ápice e saída em marcha baixa com freio solto. Registrar esterço solicitado/efetivo, velocidade, deslocamento lateral e contato com limites para distinguir geometria de controle.
3. Construir um ramal contínuo de boxes com entrada, trecho de velocidade controlada e saída. O vídeo mostra a bifurcação pelo lado da corrida; o corredor interno requer o desenho do pit lane e uma passagem embarcada pelos boxes. No simulador há pit wall e edifício decorativo. Validar os dois caminhos dirigíveis, abertura nas colisões, sentido do merge e contagem de volta antes de acrescentar placas.
4. Marcar zebras, linhas, placas de freada e pórticos em inventário por lado e distância. Conferir a temporada de cada referência. Fazer renders superiores e T-Cam no mesmo enquadramento, depois validar a passagem nos dois sentidos laterais da faixa com e sem adversários.
