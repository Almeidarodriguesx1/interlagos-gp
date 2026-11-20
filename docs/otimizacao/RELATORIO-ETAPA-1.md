# Otimização do Interlagos GP

Comparação com 8723853. As medições do navegador usaram Ferrari, 22 carros, Chase, Interlagos seco e Chrome headless em 1100 × 700. Uma tomada por versão inclui a contagem regressiva até o estado jogável.

| Medida | Antes | Depois |
|---|---:|---:|
| Modelos, bytes | 103.180.483 | 50.228.195 |
| Entrada JS principal, kB gzip do Vite | 137,44 | 69,95 |
| Chamadas de desenho na largada | 1.280 | 1.222 |
| Triângulos no quadro | 1.682.029 | 1.682.029 |
| Tempo até jogar | 40,7 s | 45,0 s |
| FPS indicados na largada | 2 | 2 |
| Testes aprovados | 78 | 78 |
| Melhor volta do benchmark competitivo seco | 81,700 s | 81,700 s |

A redução dos modelos foi de 51,3%. A entrada mais seus módulos pré-carregados somou 136.293 bytes gzip no verificador. O tempo de largada piorou nesta tomada. Uma média de FPS em volta pilotada e a duração do primeiro quadro pós-largada ainda precisam de medição. A compilação antecipada transfere trabalho para a preparação.

1. O inventário por GLB está em baseline.md e as saídas de cada comando em logs. O diagnóstico priorizou transferência dos carros e desenho do grid.
2. O script optimize:models processa originais versionados em assets-source/models, aplica meshopt, quantiza atributos visuais, remove tangentes dispensáveis e usa WebP até 2048 px no jogador e 1024 px nos LODs. O casco papaya mantém atributos float para o separador de peças. O doador RB22 já tinha decoder. As bibliotecas de processamento são de desenvolvimento. O runtime usa o decoder distribuído com Three.
3. A construção de Monza, Spa e seus minimapas passou a ocorrer ao selecionar o circuito. Os carros alternativos já carregavam por seleção. O build separa UI e Three. A migração de __dirname resolveu o aviso de configuração futura. Three ainda ultrapassa 500 kB sem compressão. Os modos compartilham o controlador de corrida.
4. A preparação acompanha três tarefas reais (cenário, piloto e rivais) e a compilação. A barra contabiliza etapas concluídas. As arquibancadas compartilham instâncias dos módulos. A geometria física gerada é comparada byte a byte por SHA-256 ao resultado do commit original na mesma arquitetura. Uma comparação com hash fixo entre Mac e Linux falhou e foi substituída. O benchmark produziu saída idêntica.
5. O ciclo de clima revelou aumento de seis texturas por rodada de três circuitos. Ao liberar o render target inteiro do ambiente, as últimas duas rodadas estabilizaram em 122, 122 e 129 texturas. O teste de carregamento confirmou os onze carros e o piloto base. O console ainda registra 404 de gravações opcionais ausentes. O CI valida tipos, testes, build, orçamentos e geometria em push e PR.

As quatro duplas de PNG nesta pasta comparam cockpit, Chase, T-Cam e TV. A diferença absoluta média RGB foi de 0,53 a 0,56 em 255. Para testar no equipamento de jogo, execute npm ci, npm run build e npm run preview. Abra /?autostart=1&car=sf26&debug=1, grave uma volta inteira com o painel Performance do Chrome e repita três vezes por versão com mesma resolução e cache. Compare tempo até a largada, intervalos entre quadros e leitura do OLED. Alterne seco e chuva e percorra os três circuitos. Para Pages, configurar base do Vite para o subdiretório e publicar dist por workflow próprio.

## Etapa 2

Priorizar eixo, largura e acesso aos boxes. Em seguida calibrar superfícies e altura das zebras, direção solar e sombras, reflexos molhados e evolução da aderência. Avaliar os efeitos visuais com o mesmo grid após cada alteração.
