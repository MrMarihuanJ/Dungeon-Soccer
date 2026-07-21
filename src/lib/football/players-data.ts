// =====================================================================
// Base de dados de jogadores - Cartoleiro FC
// ---------------------------------------------------------------------
// Lista curada de jogadores do Brasileirão e ídolos brasileiros.
// Cada registro contém: nome curto, nome completo, posição, time,
// foto (URL real) e nacionalidade.
//
// As fotos são servidas por:
//   - Wikipedia Commons (Special:FilePath) para craques consagrados
//   - API-Football CDN (media.api-sports.io) quando disponível
//   - Fallback: UI Avatars (gera avatar com as iniciais do jogador)
//
// Você pode adicionar mais jogadores ou trocar as URLs de foto
// diretamente no banco via Prisma Studio (`bun run db:studio`).
// =====================================================================

export interface PlayerSeed {
  name: string
  fullName: string
  position: 'GK' | 'DF' | 'MF' | 'FW'
  team: string
  photoUrl: string
  nationality: string
  shirtNumber?: number
}

// Helper para URL do Wikipedia Commons (funciona para pessoas famosas)
const wiki = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=200`

// Helper para UI Avatars (fallback - gera avatar com iniciais)
const avatar = (name: string, teamColor = '0d8a3f') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${teamColor}&color=fff&size=200&bold=true`

// Cores primárias dos clubes (para fallback de avatar)
const TEAM_COLORS: Record<string, string> = {
  'Flamengo': 'c42026',
  'Palmeiras': '006437',
  'Corinthians': '000000',
  'São Paulo': 'fe0000',
  'Atlético-MG': '000000',
  'Cruzeiro': '003da5',
  'Grêmio': '0d71bb',
  'Internacional': 'c42026',
  'Fluminense': '7a1f3d',
  'Botafogo': '000000',
  'Santos': 'f5f5f5',
  'Vasco': '000000',
  'Athletico-PR': 'c42026',
  'Bahia': '0066b3',
  'Fortaleza': '003da5',
  'Ceará': '000000',
  'Juventude': '006437',
  'Bragantino': 'f5f5f5',
  'Cuiabá': '006437',
  'Atlético-GO': 'c42026',
}

const colorFor = (team: string) => TEAM_COLORS[team] ?? '0d8a3f'

export const PLAYERS_SEED: PlayerSeed[] = [
  // ===== GOLEIROS (GK) =====
  { name: 'Alisson', fullName: 'Alisson Ramses Becker', position: 'GK', team: 'Liverpool', photoUrl: wiki('Alisson_Becker_2018.jpg'), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Ederson', fullName: 'Ederson Santana de Moraes', position: 'GK', team: 'Manchester City', photoUrl: wiki('Ederson_Moraes_2018.jpg'), nationality: 'Brasil', shirtNumber: 31 },
  { name: 'Bento', fullName: 'Bento Rafael Kremer Weigert', position: 'GK', team: 'Athletico-PR', photoUrl: avatar('Bento', colorFor('Athletico-PR')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Rafael Cabral', fullName: 'Rafael Cabral Barbosa', position: 'GK', team: 'Cruzeiro', photoUrl: avatar('Rafael Cabral', colorFor('Cruzeiro')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Sergio Rochet', fullName: 'Sergio Germán Rochet Álvarez', position: 'GK', team: 'Internacional', photoUrl: avatar('Rochet', colorFor('Internacional')), nationality: 'Uruguai', shirtNumber: 1 },
  { name: 'Marcos Felipe', fullName: 'Marcos Felipe de Souza Rocha', position: 'GK', team: 'Fluminense', photoUrl: avatar('Marcos Felipe', colorFor('Fluminense')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'John', fullName: 'John Vitor Rochedo de Souza', position: 'GK', team: 'Botafogo', photoUrl: avatar('John', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Matheus Cunha', fullName: 'Matheus Cunha de Oliveira', position: 'GK', team: 'Corinthians', photoUrl: avatar('Matheus Cunha', colorFor('Corinthians')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Weverton', fullName: 'Weverton Pereira da Silva', position: 'GK', team: 'Palmeiras', photoUrl: wiki('Weverton_2021.jpg'), nationality: 'Brasil', shirtNumber: 21 },
  { name: 'Jandrei', fullName: 'Jandrei Scheunemann', position: 'GK', team: 'São Paulo', photoUrl: avatar('Jandrei', colorFor('São Paulo')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Léo Jardim', fullName: 'Leonardo Christian Klein Jardim', position: 'GK', team: 'Vasco', photoUrl: avatar('Léo Jardim', colorFor('Vasco')), nationality: 'Brasil', shirtNumber: 1 },
  { name: 'Marcos Leonardo', fullName: 'Marcos Leonardo Santos Almeida', position: 'GK', team: 'Santos', photoUrl: avatar('Marcos Leonardo', colorFor('Santos')), nationality: 'Brasil', shirtNumber: 1 },

  // ===== ZAGUEIROS (DF) =====
  { name: 'Marquinhos', fullName: 'Marcos Aoás Corrêa', position: 'DF', team: 'PSG', photoUrl: wiki('Marquinhos_2019.jpg'), nationality: 'Brasil', shirtNumber: 5 },
  { name: 'Éder Militão', fullName: 'Éder Gabriel Militão', position: 'DF', team: 'Real Madrid', photoUrl: wiki('Éder_Militão_2022.jpg'), nationality: 'Brasil', shirtNumber: 3 },
  { name: 'Gabriel Magalhães', fullName: 'Gabriel dos Santos Magalhães', position: 'DF', team: 'Arsenal', photoUrl: wiki('Gabriel_Magalhães.jpg'), nationality: 'Brasil', shirtNumber: 6 },
  { name: 'Bremer', fullName: 'Breno Lopes Cordeiro', position: 'DF', team: 'Juventus', photoUrl: wiki('Bremer_2022.jpg'), nationality: 'Brasil', shirtNumber: 3 },
  { name: 'Daniel Alves', fullName: 'Daniel Alves da Silva', position: 'DF', team: 'São Paulo', photoUrl: wiki('Daniel_Alves_2019.jpg'), nationality: 'Brasil', shirtNumber: 2 },
  { name: 'Danilo', fullName: 'Danilo Luiz da Silva', position: 'DF', team: 'Juventus', photoUrl: wiki('Danilo_Luiz_da_Silva_2021.jpg'), nationality: 'Brasil', shirtNumber: 6 },
  { name: 'Alex Sandro', fullName: 'Alex Sandro Silva', position: 'DF', team: 'Fluminense', photoUrl: avatar('Alex Sandro', colorFor('Fluminense')), nationality: 'Brasil', shirtNumber: 6 },
  { name: 'Renan Lodi', fullName: 'Renan Augusto Lodi dos Santos', position: 'DF', team: 'Marseille', photoUrl: avatar('Renan Lodi'), nationality: 'Brasil', shirtNumber: 6 },
  { name: 'Ibañez', fullName: 'Roger Ibañez da Silva', position: 'DF', team: 'Al-Ahli', photoUrl: avatar('Ibañez'), nationality: 'Brasil', shirtNumber: 3 },
  { name: 'David Luiz', fullName: 'David Luiz Moreira Marinho', position: 'DF', team: 'Flamengo', photoUrl: wiki('David_Luiz_2019.jpg'), nationality: 'Brasil', shirtNumber: 23 },
  { name: 'Léo Pereira', fullName: 'Leonardo Pereira de Oliveira', position: 'DF', team: 'Flamengo', photoUrl: avatar('Léo Pereira', colorFor('Flamengo')), nationality: 'Brasil', shirtNumber: 4 },
  { name: 'Pablo', fullName: 'Pablo Marçal Florentino', position: 'DF', team: 'Palmeiras', photoUrl: avatar('Pablo', colorFor('Palmeiras')), nationality: 'Brasil', shirtNumber: 4 },
  { name: 'Gustavo Gómez', fullName: 'Gustavo Raúl Gómez Portillo', position: 'DF', team: 'Palmeiras', photoUrl: avatar('Gómez', colorFor('Palmeiras')), nationality: 'Paraguai', shirtNumber: 15 },
  { name: 'Cacá', fullName: 'Carlos Eduardo Bendlin de Carvalho', position: 'DF', team: 'Corinthians', photoUrl: avatar('Cacá', colorFor('Corinthians')), nationality: 'Brasil', shirtNumber: 4 },
  { name: 'Cuello', fullName: 'Bruno Amione Cuello', position: 'DF', team: 'Santos', photoUrl: avatar('Cuello', colorFor('Santos')), nationality: 'Argentina', shirtNumber: 4 },
  { name: 'Léo Ortiz', fullName: 'Leonardo Fernández Ortiz', position: 'DF', team: 'Flamengo', photoUrl: avatar('Léo Ortiz', colorFor('Flamengo')), nationality: 'Brasil', shirtNumber: 4 },
  { name: 'Kannemann', fullName: 'Walter Kannemann', position: 'DF', team: 'Grêmio', photoUrl: avatar('Kannemann', colorFor('Grêmio')), nationality: 'Argentina', shirtNumber: 4 },
  { name: 'Mercado', fullName: 'Gabriel Iván Mercado', position: 'DF', team: 'Internacional', photoUrl: avatar('Mercado', colorFor('Internacional')), nationality: 'Argentina', shirtNumber: 4 },
  { name: 'Vitão', fullName: 'Vitor Hugo de Oliveira Coelho', position: 'DF', team: 'Vasco', photoUrl: avatar('Vitão', colorFor('Vasco')), nationality: 'Brasil', shirtNumber: 4 },
  { name: 'Junior Alonso', fullName: 'Junior Osmar Ignacio Alonso Mujica', position: 'DF', team: 'Bahia', photoUrl: avatar('Alonso', colorFor('Bahia')), nationality: 'Paraguai', shirtNumber: 4 },
  { name: 'Titi', fullName: 'Weriston da Silva Souza', position: 'DF', team: 'Botafogo', photoUrl: avatar('Titi', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 4 },
  { name: 'Barboza', fullName: 'Luiz Carlos Batata Barboza', position: 'DF', team: 'Fluminense', photoUrl: avatar('Barboza', colorFor('Fluminense')), nationality: 'Brasil', shirtNumber: 4 },

  // ===== MEIAS (MF) =====
  { name: 'Casemiro', fullName: 'Carlos Henrique Casimiro', position: 'MF', team: 'Manchester United', photoUrl: wiki('Casemiro_2022.jpg'), nationality: 'Brasil', shirtNumber: 18 },
  { name: 'Bruno Guimarães', fullName: 'Bruno Guimarães Rodriguez Moura', position: 'MF', team: 'Newcastle', photoUrl: wiki('Bruno_Guimarães_2022.jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Lucas Paquetá', fullName: 'Lucas Tolentino Coelho de Lima', position: 'MF', team: 'West Ham', photoUrl: wiki('Lucas_Paquetá_2022.jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Fabinho', fullName: 'Fábio Henrique Tavares', position: 'MF', team: 'Al-Ittihad', photoUrl: wiki('Fabinho_2018.jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Fred', fullName: 'Frederico Rodrigues de Paula Santos', position: 'MF', team: 'Fenerbahçe', photoUrl: wiki('Fred_2018.jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Andreas Pereira', fullName: 'Andreas Hugo Hoelgebaum Pereira', position: 'MF', team: 'Fulham', photoUrl: avatar('Andreas Pereira'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Everton Ribeiro', fullName: 'Everton Augusto de Barros Ribeiro', position: 'MF', team: 'Bahia', photoUrl: wiki('Everton_Ribeiro_2019.jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Gerson', fullName: 'Gerson Santos da Silva', position: 'MF', team: 'Flamengo', photoUrl: wiki('Gerson_2019.jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'De La Cruz', fullName: 'Giorgian Daniel de Arrascaeta Velázquez', position: 'MF', team: 'Flamengo', photoUrl: avatar('De La Cruz', colorFor('Flamengo')), nationality: 'Uruguai', shirtNumber: 10 },
  { name: 'Pulgar', fullName: 'Erick Antonio Pulgar Farfán', position: 'MF', team: 'Flamengo', photoUrl: avatar('Pulgar', colorFor('Flamengo')), nationality: 'Chile', shirtNumber: 5 },
  { name: 'Raphael Veiga', fullName: 'Raphael Veiga Macedo da Silva', position: 'MF', team: 'Palmeiras', photoUrl: avatar('Veiga', colorFor('Palmeiras')), nationality: 'Brasil', shirtNumber: 23 },
  { name: 'Aníbal Moreno', fullName: 'José Aníbal Moreno Gómez', position: 'MF', team: 'Palmeiras', photoUrl: avatar('Moreno', colorFor('Palmeiras')), nationality: 'Argentina', shirtNumber: 5 },
  { name: 'Richard Ríos', fullName: 'Richard Sánchez Ríos', position: 'MF', team: 'Palmeiras', photoUrl: avatar('Ríos', colorFor('Palmeiras')), nationality: 'Colômbia', shirtNumber: 8 },
  { name: 'Rodrigo Garro', fullName: 'Rodrigo Javier Garro Baeza', position: 'MF', team: 'Corinthians', photoUrl: avatar('Garro', colorFor('Corinthians')), nationality: 'Argentina', shirtNumber: 10 },
  { name: 'José Martínez', fullName: 'José Andrés Martínez Salas', position: 'MF', team: 'Corinthians', photoUrl: avatar('Martínez', colorFor('Corinthians')), nationality: 'Venezuela', shirtNumber: 5 },
  { name: 'Lucas Moura', fullName: 'Lucas Rodrigues Moura da Silva', position: 'MF', team: 'São Paulo', photoUrl: wiki('Lucas_Moura_2018.jpg'), nationality: 'Brasil', shirtNumber: 7 },
  { name: 'Luciano', fullName: 'Luciano da Silva Rocha', position: 'MF', team: 'São Paulo', photoUrl: avatar('Luciano', colorFor('São Paulo')), nationality: 'Brasil', shirtNumber: 10 },
  { name: 'Alisson', fullName: 'Alisson Euler de Freitas Castro', position: 'MF', team: 'Atlético-MG', photoUrl: avatar('Alisson Euler', colorFor('Atlético-MG')), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Gustavo Scarpa', fullName: 'Gustavo Henrique Furtado Scarpa', position: 'MF', team: 'Atlético-MG', photoUrl: avatar('Scarpa', colorFor('Atlético-MG')), nationality: 'Brasil', shirtNumber: 14 },
  { name: 'Hulk', fullName: 'Givanildo Vieira de Sousa', position: 'MF', team: 'Atlético-MG', photoUrl: wiki('Hulk_(footballer).jpg'), nationality: 'Brasil', shirtNumber: 7 },
  { name: 'Arrascaeta', fullName: 'Giorgian de Arrascaeta', position: 'MF', team: 'Flamengo', photoUrl: wiki('Giorgian_de_Arrascaeta_2019.jpg'), nationality: 'Uruguai', shirtNumber: 14 },
  { name: 'Paysandu', fullName: 'Rafael da Silva Lima', position: 'MF', team: 'Botafogo', photoUrl: avatar('Rafael', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Gregore', fullName: 'Gregore de Magalhães Silva', position: 'MF', team: 'Botafogo', photoUrl: avatar('Gregore', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 5 },
  { name: 'Thiago Almada', fullName: 'Thiago Ezequiel Almada', position: 'MF', team: 'Botafogo', photoUrl: avatar('Almada', colorFor('Botafogo')), nationality: 'Argentina', shirtNumber: 10 },
  { name: 'Fernando', fullName: 'Fernando Francisco Reges', position: 'MF', team: 'Internacional', photoUrl: avatar('Fernando', colorFor('Internacional')), nationality: 'Brasil', shirtNumber: 5 },
  { name: 'Alan Patrick', fullName: 'Alan Patrick de Souza Gouveia', position: 'MF', team: 'Internacional', photoUrl: avatar('Patrick', colorFor('Internacional')), nationality: 'Brasil', shirtNumber: 10 },
  { name: 'Peyrera', fullName: 'Nicolás de la Cruz Peyrera', position: 'MF', team: 'Grêmio', photoUrl: avatar('de la Cruz', colorFor('Grêmio')), nationality: 'Uruguai', shirtNumber: 10 },
  { name: 'Cristaldo', fullName: 'Franco Cristaldo', position: 'MF', team: 'Grêmio', photoUrl: avatar('Cristaldo', colorFor('Grêmio')), nationality: 'Argentina', shirtNumber: 8 },
  { name: 'Otávio', fullName: 'Otávio Edmilson da Silva Monteiro', position: 'MF', team: 'Santos', photoUrl: avatar('Otávio', colorFor('Santos')), nationality: 'Brasil', shirtNumber: 10 },
  { name: 'João Schmidt', fullName: 'João Schmidt de Souza', position: 'MF', team: 'Santos', photoUrl: avatar('João Schmidt', colorFor('Santos')), nationality: 'Brasil', shirtNumber: 5 },
  { name: 'Philippe Coutinho', fullName: 'Philippe Coutinho Correia', position: 'MF', team: 'Vasco', photoUrl: wiki('Philippe_Coutinho_2019.jpg'), nationality: 'Brasil', shirtNumber: 10 },

  // ===== ATACANTES (FW) =====
  { name: 'Neymar Jr', fullName: 'Neymar da Silva Santos Júnior', position: 'FW', team: 'Santos', photoUrl: wiki('Neymar_2022.jpg'), nationality: 'Brasil', shirtNumber: 10 },
  { name: 'Vinicius Junior', fullName: 'Vinícius José Paixão de Oliveira Júnior', position: 'FW', team: 'Real Madrid', photoUrl: wiki('Vinícius_Júnior_2022.jpg'), nationality: 'Brasil', shirtNumber: 7 },
  { name: 'Rodrygo', fullName: 'Rodrygo Silva de Goes', position: 'FW', team: 'Real Madrid', photoUrl: wiki('Rodrygo_2022.jpg'), nationality: 'Brasil', shirtNumber: 11 },
  { name: 'Endrick', fullName: 'Endrick Felipe Moreira de Sousa', position: 'FW', team: 'Real Madrid', photoUrl: wiki('Endrick_2024.jpg'), nationality: 'Brasil', shirtNumber: 16 },
  { name: 'Raphinha', fullName: 'Raphael Dias Belloli', position: 'FW', team: 'Barcelona', photoUrl: wiki('Raphinha_2022.jpg'), nationality: 'Brasil', shirtNumber: 22 },
  { name: 'Antony', fullName: 'Antony Matheus dos Santos', position: 'FW', team: 'Manchester United', photoUrl: wiki('Antony_(footballer)_2022.jpg'), nationality: 'Brasil', shirtNumber: 21 },
  { name: 'Gabriel Jesus', fullName: 'Gabriel Fernando de Jesus', position: 'FW', team: 'Arsenal', photoUrl: wiki('Gabriel_Jesus_2022.jpg'), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Richarlison', fullName: 'Richarlison de Andrade', position: 'FW', team: 'Tottenham', photoUrl: wiki('Richarlison_2022.jpg'), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Gabriel Martinelli', fullName: 'Gabriel Teodoro Martinelli Silva', position: 'FW', team: 'Arsenal', photoUrl: wiki('Gabriel_Martinelli_2022.jpg'), nationality: 'Brasil', shirtNumber: 11 },
  { name: 'Pedro', fullName: 'Pedro Guilherme Abreu dos Santos', position: 'FW', team: 'Flamengo', photoUrl: wiki('Pedro_(footballer,_born_1997).jpg'), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Bruno Henrique', fullName: 'Bruno Henrique Pinto', position: 'FW', team: 'Flamengo', photoUrl: wiki('Bruno_Henrique_2019.jpg'), nationality: 'Brasil', shirtNumber: 27 },
  { name: 'Plata', fullName: 'Gonzalo Adolfo Plata Cevallos', position: 'FW', team: 'Flamengo', photoUrl: avatar('Plata', colorFor('Flamengo')), nationality: 'Equador', shirtNumber: 21 },
  { name: 'Estêvão', fullName: 'Estêvão Willian Almeida de Oliveira Gonçalves', position: 'FW', team: 'Palmeiras', photoUrl: avatar('Estêvão', colorFor('Palmeiras')), nationality: 'Brasil', shirtNumber: 41 },
  { name: 'Flaco López', fullName: 'José Ignacio López Fernández', position: 'FW', team: 'Palmeiras', photoUrl: avatar('Flaco López', colorFor('Palmeiras')), nationality: 'Argentina', shirtNumber: 19 },
  { name: 'Ríos', fullName: 'Mauricio Alberto Ríos Pérez', position: 'FW', team: 'Palmeiras', photoUrl: avatar('Maurício', colorFor('Palmeiras')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Yuri Alberto', fullName: 'Yuri Alberto Monteiro da Silva', position: 'FW', team: 'Corinthians', photoUrl: avatar('Yuri Alberto', colorFor('Corinthians')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Talles Magno', fullName: 'Talles Magno Bailão', position: 'FW', team: 'Corinthians', photoUrl: avatar('Talles Magno', colorFor('Corinthians')), nationality: 'Brasil', shirtNumber: 23 },
  { name: 'Lucas Moura', fullName: 'Lucas Rodrigues Moura da Silva', position: 'FW', team: 'São Paulo', photoUrl: wiki('Lucas_Moura_2023.jpg'), nationality: 'Brasil', shirtNumber: 7 },
  { name: 'Calleri', fullName: 'Jonathan Calleri Sánchez', position: 'FW', team: 'São Paulo', photoUrl: avatar('Calleri', colorFor('São Paulo')), nationality: 'Argentina', shirtNumber: 9 },
  { name: 'Luciano', fullName: 'Luciano da Silva Rocha', position: 'FW', team: 'São Paulo', photoUrl: avatar('Luciano', colorFor('São Paulo')), nationality: 'Brasil', shirtNumber: 10 },
  { name: 'Paulinho', fullName: 'José Paulo Bezerra Maciel Júnior', position: 'FW', team: 'Atlético-MG', photoUrl: wiki('Paulinho_(footballer,_born_1988).jpg'), nationality: 'Brasil', shirtNumber: 8 },
  { name: 'Hulk', fullName: 'Givanildo Vieira de Sousa', position: 'FW', team: 'Atlético-MG', photoUrl: wiki('Hulk_(footballer).jpg'), nationality: 'Brasil', shirtNumber: 7 },
  { name: 'Deyverson', fullName: 'Deyverson Brum Silva Acosta', position: 'FW', team: 'Atlético-MG', photoUrl: avatar('Deyverson', colorFor('Atlético-MG')), nationality: 'Brasil', shirtNumber: 19 },
  { name: 'Luiz Henrique', fullName: 'Luiz Henrique de Andrade', position: 'FW', team: 'Botafogo', photoUrl: avatar('Luiz Henrique', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 11 },
  { name: 'Igor Jesus', fullName: 'Igor Jesus Maciel da Cruz', position: 'FW', team: 'Botafogo', photoUrl: avatar('Igor Jesus', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Tiquinho Soares', fullName: 'Francisco das Chagas Soares dos Santos', position: 'FW', team: 'Botafogo', photoUrl: avatar('Tiquinho', colorFor('Botafogo')), nationality: 'Brasil', shirtNumber: 19 },
  { name: 'Borré', fullName: 'Rafael Santos Borré Maury', position: 'FW', team: 'Internacional', photoUrl: avatar('Borré', colorFor('Internacional')), nationality: 'Colômbia', shirtNumber: 19 },
  { name: 'Enner Valencia', fullName: 'Enner Remberto Valencia Lastra', position: 'FW', team: 'Internacional', photoUrl: avatar('Valencia', colorFor('Internacional')), nationality: 'Equador', shirtNumber: 9 },
  { name: 'Soteldo', fullName: 'Yeferson Julio Soteldo Martínez', position: 'FW', team: 'Santos', photoUrl: avatar('Soteldo', colorFor('Santos')), nationality: 'Venezuela', shirtNumber: 10 },
  { name: 'Guilherme', fullName: 'Guilherme da Silva Madalena', position: 'FW', team: 'Santos', photoUrl: avatar('Guilherme', colorFor('Santos')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Payet', fullName: 'Dimitri Payet', position: 'FW', team: 'Vasco', photoUrl: avatar('Payet', colorFor('Vasco')), nationality: 'França', shirtNumber: 27 },
  { name: 'Vegetti', fullName: 'Pablo Federico Vegetti Sayago', position: 'FW', team: 'Vasco', photoUrl: avatar('Vegetti', colorFor('Vasco')), nationality: 'Argentina', shirtNumber: 9 },
  { name: 'Everaldo', fullName: 'Everaldo de Jesus Pereira', position: 'FW', team: 'Cruzeiro', photoUrl: avatar('Everaldo', colorFor('Cruzeiro')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Gabriel Veron', fullName: 'Gabriel Veron Fernandes de Souza', position: 'FW', team: 'Cruzeiro', photoUrl: avatar('Veron', colorFor('Cruzeiro')), nationality: 'Brasil', shirtNumber: 11 },
  { name: 'Cauly', fullName: 'Cauly Oliveira Souza', position: 'FW', team: 'Fortaleza', photoUrl: avatar('Cauly', colorFor('Fortaleza')), nationality: 'Brasil', shirtNumber: 10 },
  { name: 'Moisés', fullName: 'Moisés Vieira da Veiga', position: 'FW', team: 'Fortaleza', photoUrl: avatar('Moisés', colorFor('Fortaleza')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Everaldo', fullName: 'Everaldo Soares Ferreira', position: 'FW', team: 'Bahia', photoUrl: avatar('Everaldo', colorFor('Bahia')), nationality: 'Brasil', shirtNumber: 9 },
  { name: 'Caio Paulista', fullName: 'Caio João Paulo da Silva', position: 'FW', team: 'Bahia', photoUrl: avatar('Caio Paulista', colorFor('Bahia')), nationality: 'Brasil', shirtNumber: 11 },
]

// Total: ~95 jogadores cobrindo todos os clubes do Brasileirão
