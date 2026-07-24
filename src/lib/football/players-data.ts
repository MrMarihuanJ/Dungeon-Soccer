// =====================================================================
// Base de dados de jogadores - Dungeon and Soccer
// ---------------------------------------------------------------------
// Lista curada com overall (estilo FIFA), idade, leagueTier e flags.
// =====================================================================

export interface PlayerSeed {
  name: string
  fullName: string
  position: 'GK' | 'DF' | 'LD' | 'LE' | 'MF' | 'FW'
  team: string
  photoUrl: string
  nationality: string
  shirtNumber?: number
  // Sistema de rating (estilo FIFA)
  overall: number
  age: number
  pace?: number
  shooting?: number
  passing?: number
  dribbling?: number
  defending?: number
  physical?: number
  leagueTier?: 'TOP5' | 'TOP10' | 'BR1' | 'TOP20' | 'OTHER'
  isRetired?: boolean
  isInactive?: boolean
}

const wiki = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=200`

const avatar = (name: string, teamColor = '0d8a3f') =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${teamColor}&color=fff&size=200&bold=true`

const TEAM_COLORS: Record<string, string> = {
  'Flamengo': 'c42026', 'Palmeiras': '006437', 'Corinthians': '000000',
  'São Paulo': 'fe0000', 'Atlético-MG': '000000', 'Cruzeiro': '003da5',
  'Grêmio': '0d71bb', 'Internacional': 'c42026', 'Fluminense': '7a1f3d',
  'Botafogo': '000000', 'Santos': 'f5f5f5', 'Vasco': '000000',
  'Athletico-PR': 'c42026', 'Bahia': '0066b3', 'Fortaleza': '003da5',
}

const colorFor = (team: string) => TEAM_COLORS[team] ?? '0d8a3f'

// Helper para criar jogador com defaults
const mk = (
  name: string, fullName: string, position: PlayerSeed['position'], team: string,
  photoUrl: string, nationality: string, shirtNumber: number | undefined,
  overall: number, age: number, leagueTier: PlayerSeed['leagueTier'] = 'OTHER',
  attrs?: Partial<Pick<PlayerSeed, 'pace' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical'>>,
  isRetired = false,
): PlayerSeed => ({
  name, fullName, position, team, photoUrl, nationality, shirtNumber,
  overall, age, leagueTier,
  pace: attrs?.pace ?? (position === 'GK' ? 50 : position === 'DF' ? 65 : position === 'LD' || position === 'LE' ? 78 : position === 'MF' ? 70 : 80),
  shooting: attrs?.shooting ?? (position === 'GK' ? 30 : position === 'DF' ? 45 : position === 'LD' || position === 'LE' ? 55 : position === 'MF' ? 70 : 85),
  passing: attrs?.passing ?? (position === 'GK' ? 50 : position === 'DF' ? 65 : position === 'LD' || position === 'LE' ? 72 : position === 'MF' ? 80 : 75),
  dribbling: attrs?.dribbling ?? (position === 'GK' ? 40 : position === 'DF' ? 60 : position === 'LD' || position === 'LE' ? 75 : position === 'MF' ? 80 : 85),
  defending: attrs?.defending ?? (position === 'GK' ? 30 : position === 'DF' ? 85 : position === 'LD' || position === 'LE' ? 78 : position === 'MF' ? 65 : 40),
  physical: attrs?.physical ?? (position === 'GK' ? 70 : position === 'DF' ? 80 : position === 'LD' || position === 'LE' ? 75 : position === 'MF' ? 70 : 75),
  isRetired,
  isInactive: false,
})

export const PLAYERS_SEED: PlayerSeed[] = [
  // ===== GOLEIROS =====
  mk('Alisson', 'Alisson Ramses Becker', 'GK', 'Liverpool', wiki('Alisson_Becker_2018.jpg'), 'Brasil', 1, 89, 32, 'TOP5', { pace: 58, shooting: 25, passing: 60, dribbling: 30, defending: 88, physical: 85 }),
  mk('Ederson', 'Ederson Santana de Moraes', 'GK', 'Manchester City', wiki('Ederson_Moraes_2018.jpg'), 'Brasil', 31, 88, 31, 'TOP5', { pace: 56, shooting: 25, passing: 75, dribbling: 40, defending: 87, physical: 83 }),
  mk('Bento', 'Bento Rafael Kremer Weigert', 'GK', 'Athletico-PR', avatar('Bento', colorFor('Athletico-PR')), 'Brasil', 1, 79, 26, 'BR1'),
  mk('Rafael Cabral', 'Rafael Cabral Barbosa', 'GK', 'Cruzeiro', avatar('Rafael Cabral', colorFor('Cruzeiro')), 'Brasil', 1, 78, 35, 'BR1'),
  mk('Sergio Rochet', 'Sergio Germán Rochet Álvarez', 'GK', 'Internacional', avatar('Rochet', colorFor('Internacional')), 'Uruguai', 1, 79, 32, 'BR1'),
  mk('Marcos Felipe', 'Marcos Felipe de Souza Rocha', 'GK', 'Fluminense', avatar('Marcos Felipe', colorFor('Fluminense')), 'Brasil', 1, 76, 29, 'BR1'),
  mk('John', 'John Vitor Rochedo de Souza', 'GK', 'Botafogo', avatar('John', colorFor('Botafogo')), 'Brasil', 1, 77, 28, 'BR1'),
  mk('Matheus Cunha', 'Matheus Cunha de Oliveira', 'GK', 'Corinthians', avatar('Matheus Cunha', colorFor('Corinthians')), 'Brasil', 1, 76, 26, 'BR1'),
  mk('Weverton', 'Weverton Pereira da Silva', 'GK', 'Palmeiras', wiki('Weverton_2021.jpg'), 'Brasil', 21, 82, 37, 'BR1'),
  mk('Jandrei', 'Jandrei Scheunemann', 'GK', 'São Paulo', avatar('Jandrei', colorFor('São Paulo')), 'Brasil', 1, 78, 33, 'BR1'),
  mk('Léo Jardim', 'Leonardo Christian Klein Jardim', 'GK', 'Vasco', avatar('Léo Jardim', colorFor('Vasco')), 'Brasil', 1, 76, 30, 'BR1'),

  // ===== ZAGUEIROS =====
  mk('Marquinhos', 'Marcos Aoás Corrêa', 'DF', 'PSG', wiki('Marquinhos_2019.jpg'), 'Brasil', 5, 86, 31, 'TOP5', { pace: 80, defending: 87, physical: 84 }),
  mk('Éder Militão', 'Éder Gabriel Militão', 'DF', 'Real Madrid', wiki('Éder_Militão_2022.jpg'), 'Brasil', 3, 84, 27, 'TOP5', { pace: 82, defending: 84, physical: 82 }),
  mk('Gabriel Magalhães', 'Gabriel dos Santos Magalhães', 'DF', 'Arsenal', wiki('Gabriel_Magalhães.jpg'), 'Brasil', 6, 83, 27, 'TOP5', { pace: 75, defending: 84, physical: 86 }),
  mk('Bremer', 'Breno Lopes Cordeiro', 'DF', 'Juventus', wiki('Bremer_2022.jpg'), 'Brasil', 3, 83, 28, 'TOP5', { pace: 80, defending: 85, physical: 85 }),
  mk('Danilo', 'Danilo Luiz da Silva', 'LD', 'Juventus', wiki('Danilo_Luiz_da_Silva_2021.jpg'), 'Brasil', 6, 80, 34, 'TOP5'),
  mk('Alex Sandro', 'Alex Sandro Silva', 'LE', 'Fluminense', avatar('Alex Sandro', colorFor('Fluminense')), 'Brasil', 6, 78, 35, 'BR1'),
  mk('Renan Lodi', 'Renan Augusto Lodi dos Santos', 'LE', 'Marseille', avatar('Renan Lodi'), 'Brasil', 6, 79, 27, 'TOP10'),
  mk('Ibañez', 'Roger Ibañez da Silva', 'DF', 'Al-Ahli', avatar('Ibañez'), 'Brasil', 3, 78, 26, 'OTHER'),
  mk('David Luiz', 'David Luiz Moreira Marinho', 'DF', 'Flamengo', wiki('David_Luiz_2019.jpg'), 'Brasil', 23, 78, 38, 'BR1'),
  mk('Léo Pereira', 'Leonardo Pereira de Oliveira', 'DF', 'Flamengo', avatar('Léo Pereira', colorFor('Flamengo')), 'Brasil', 4, 77, 30, 'BR1'),
  mk('Gustavo Gómez', 'Gustavo Raúl Gómez Portillo', 'DF', 'Palmeiras', avatar('Gómez', colorFor('Palmeiras')), 'Paraguai', 15, 82, 32, 'BR1'),
  mk('Cacá', 'Carlos Eduardo Bendlin de Carvalho', 'DF', 'Corinthians', avatar('Cacá', colorFor('Corinthians')), 'Brasil', 4, 75, 25, 'BR1'),
  mk('Cuello', 'Bruno Amione Cuello', 'DF', 'Santos', avatar('Cuello', colorFor('Santos')), 'Argentina', 4, 75, 24, 'BR1'),
  mk('Léo Ortiz', 'Leonardo Fernández Ortiz', 'DF', 'Flamengo', avatar('Léo Ortiz', colorFor('Flamengo')), 'Brasil', 4, 78, 29, 'BR1'),
  mk('Kannemann', 'Walter Kannemann', 'DF', 'Grêmio', avatar('Kannemann', colorFor('Grêmio')), 'Argentina', 4, 78, 34, 'BR1'),
  mk('Mercado', 'Gabriel Iván Mercado', 'DF', 'Internacional', avatar('Mercado', colorFor('Internacional')), 'Argentina', 4, 76, 38, 'BR1'),
  mk('Vitão', 'Vitor Hugo de Oliveira Coelho', 'DF', 'Vasco', avatar('Vitão', colorFor('Vasco')), 'Brasil', 4, 76, 25, 'BR1'),
  mk('Junior Alonso', 'Junior Osmar Ignacio Alonso Mujica', 'DF', 'Bahia', avatar('Alonso', colorFor('Bahia')), 'Paraguai', 4, 77, 33, 'BR1'),
  mk('Titi', 'Weriston da Silva Souza', 'DF', 'Botafogo', avatar('Titi', colorFor('Botafogo')), 'Brasil', 4, 75, 28, 'BR1'),
  mk('Barboza', 'Luiz Carlos Batata Barboza', 'DF', 'Fluminense', avatar('Barboza', colorFor('Fluminense')), 'Brasil', 4, 76, 28, 'BR1'),

  // ===== MEIAS =====
  mk('Casemiro', 'Carlos Henrique Casimiro', 'MF', 'Manchester United', wiki('Casemiro_2022.jpg'), 'Brasil', 18, 85, 33, 'TOP5', { pace: 65, passing: 80, defending: 86, physical: 88 }),
  mk('Bruno Guimarães', 'Bruno Guimarães Rodriguez Moura', 'MF', 'Newcastle', wiki('Bruno_Guimarães_2022.jpg'), 'Brasil', 8, 84, 27, 'TOP5', { pace: 70, passing: 84, dribbling: 84, defending: 75, physical: 80 }),
  mk('Lucas Paquetá', 'Lucas Tolentino Coelho de Lima', 'MF', 'West Ham', wiki('Lucas_Paquetá_2022.jpg'), 'Brasil', 8, 82, 28, 'TOP5', { pace: 72, passing: 82, dribbling: 86, defending: 65 }),
  mk('Fabinho', 'Fábio Henrique Tavares', 'MF', 'Al-Ittihad', wiki('Fabinho_2018.jpg'), 'Brasil', 8, 80, 32, 'OTHER'),
  mk('Fred', 'Frederico Rodrigues de Paula Santos', 'MF', 'Fenerbahçe', wiki('Fred_2018.jpg'), 'Brasil', 8, 78, 32, 'TOP10'),
  mk('Andreas Pereira', 'Andreas Hugo Hoelgebaum Pereira', 'MF', 'Fulham', avatar('Andreas Pereira'), 'Brasil', 8, 79, 29, 'TOP5'),
  mk('Everton Ribeiro', 'Everton Augusto de Barros Ribeiro', 'MF', 'Bahia', wiki('Everton_Ribeiro_2019.jpg'), 'Brasil', 8, 76, 36, 'BR1'),
  mk('Gerson', 'Gerson Santos da Silva', 'MF', 'Flamengo', wiki('Gerson_2019.jpg'), 'Brasil', 8, 80, 28, 'BR1'),
  mk('De La Cruz', 'Giorgian Daniel de Arrascaeta Velázquez', 'MF', 'Flamengo', avatar('De La Cruz', colorFor('Flamengo')), 'Uruguai', 10, 82, 27, 'BR1'),
  mk('Pulgar', 'Erick Antonio Pulgar Farfán', 'MF', 'Flamengo', avatar('Pulgar', colorFor('Flamengo')), 'Chile', 5, 76, 31, 'BR1'),
  mk('Raphael Veiga', 'Raphael Veiga Macedo da Silva', 'MF', 'Palmeiras', avatar('Veiga', colorFor('Palmeiras')), 'Brasil', 23, 78, 30, 'BR1'),
  mk('Aníbal Moreno', 'José Aníbal Moreno Gómez', 'MF', 'Palmeiras', avatar('Moreno', colorFor('Palmeiras')), 'Argentina', 5, 76, 26, 'BR1'),
  mk('Richard Ríos', 'Richard Sánchez Ríos', 'MF', 'Palmeiras', avatar('Ríos', colorFor('Palmeiras')), 'Colômbia', 8, 77, 25, 'BR1'),
  mk('Rodrigo Garro', 'Rodrigo Javier Garro Baeza', 'MF', 'Corinthians', avatar('Garro', colorFor('Corinthians')), 'Argentina', 10, 79, 27, 'BR1'),
  mk('José Martínez', 'José Andrés Martínez Salas', 'MF', 'Corinthians', avatar('Martínez', colorFor('Corinthians')), 'Venezuela', 5, 76, 32, 'BR1'),
  mk('Lucas Moura', 'Lucas Rodrigues Moura da Silva', 'MF', 'São Paulo', wiki('Lucas_Moura_2018.jpg'), 'Brasil', 7, 78, 33, 'BR1'),
  mk('Luciano', 'Luciano da Silva Rocha', 'MF', 'São Paulo', avatar('Luciano', colorFor('São Paulo')), 'Brasil', 10, 75, 32, 'BR1'),
  mk('Gustavo Scarpa', 'Gustavo Henrique Furtado Scarpa', 'MF', 'Atlético-MG', avatar('Scarpa', colorFor('Atlético-MG')), 'Brasil', 14, 78, 31, 'BR1'),
  mk('Hulk', 'Givanildo Vieira de Sousa', 'MF', 'Atlético-MG', wiki('Hulk_(footballer).jpg'), 'Brasil', 7, 79, 39, 'BR1', { pace: 70, shooting: 82, physical: 90 }),
  mk('Arrascaeta', 'Giorgian de Arrascaeta', 'MF', 'Flamengo', wiki('Giorgian_de_Arrascaeta_2019.jpg'), 'Uruguai', 14, 83, 31, 'BR1', { pace: 72, passing: 84, dribbling: 86 }),
  mk('Gregore', 'Gregore de Magalhães Silva', 'MF', 'Botafogo', avatar('Gregore', colorFor('Botafogo')), 'Brasil', 5, 76, 31, 'BR1'),
  mk('Thiago Almada', 'Thiago Ezequiel Almada', 'MF', 'Botafogo', avatar('Almada', colorFor('Botafogo')), 'Argentina', 10, 82, 24, 'BR1'),
  mk('Fernando', 'Fernando Francisco Reges', 'MF', 'Internacional', avatar('Fernando', colorFor('Internacional')), 'Brasil', 5, 76, 38, 'BR1'),
  mk('Alan Patrick', 'Alan Patrick de Souza Gouveia', 'MF', 'Internacional', avatar('Patrick', colorFor('Internacional')), 'Brasil', 10, 78, 34, 'BR1'),
  mk('Peyrera', 'Nicolás de la Cruz Peyrera', 'MF', 'Grêmio', avatar('de la Cruz', colorFor('Grêmio')), 'Uruguai', 10, 80, 28, 'BR1'),
  mk('Cristaldo', 'Franco Cristaldo', 'MF', 'Grêmio', avatar('Cristaldo', colorFor('Grêmio')), 'Argentina', 8, 76, 28, 'BR1'),
  mk('Otávio', 'Otávio Edmilson da Silva Monteiro', 'MF', 'Santos', avatar('Otávio', colorFor('Santos')), 'Brasil', 10, 75, 31, 'BR1'),
  mk('João Schmidt', 'João Schmidt de Souza', 'MF', 'Santos', avatar('João Schmidt', colorFor('Santos')), 'Brasil', 5, 75, 32, 'BR1'),
  mk('Philippe Coutinho', 'Philippe Coutinho Correia', 'MF', 'Vasco', wiki('Philippe_Coutinho_2019.jpg'), 'Brasil', 10, 76, 33, 'BR1'),

  // ===== ATACANTES =====
  mk('Neymar Jr', 'Neymar da Silva Santos Júnior', 'FW', 'Santos', wiki('Neymar_2022.jpg'), 'Brasil', 10, 85, 33, 'BR1', { pace: 82, shooting: 80, dribbling: 92, physical: 65 }),
  mk('Vinicius Junior', 'Vinícius José Paixão de Oliveira Júnior', 'FW', 'Real Madrid', wiki('Vinícius_Júnior_2022.jpg'), 'Brasil', 7, 89, 25, 'TOP5', { pace: 90, shooting: 80, dribbling: 90, physical: 70 }),
  mk('Rodrygo', 'Rodrygo Silva de Goes', 'FW', 'Real Madrid', wiki('Rodrygo_2022.jpg'), 'Brasil', 11, 84, 25, 'TOP5', { pace: 85, shooting: 78, dribbling: 86 }),
  mk('Endrick', 'Endrick Felipe Moreira de Sousa', 'FW', 'Real Madrid', wiki('Endrick_2024.jpg'), 'Brasil', 16, 78, 19, 'TOP5', { pace: 82, shooting: 76, dribbling: 80 }),
  mk('Raphinha', 'Raphael Dias Belloli', 'FW', 'Barcelona', wiki('Raphinha_2022.jpg'), 'Brasil', 22, 84, 28, 'TOP5', { pace: 85, shooting: 80, dribbling: 84 }),
  mk('Antony', 'Antony Matheus dos Santos', 'FW', 'Manchester United', wiki('Antony_(footballer)_2022.jpg'), 'Brasil', 21, 79, 25, 'TOP5'),
  mk('Gabriel Jesus', 'Gabriel Fernando de Jesus', 'FW', 'Arsenal', wiki('Gabriel_Jesus_2022.jpg'), 'Brasil', 9, 81, 28, 'TOP5'),
  mk('Richarlison', 'Richarlison de Andrade', 'FW', 'Tottenham', wiki('Richarlison_2022.jpg'), 'Brasil', 9, 79, 28, 'TOP5'),
  mk('Gabriel Martinelli', 'Gabriel Teodoro Martinelli Silva', 'FW', 'Arsenal', wiki('Gabriel_Martinelli_2022.jpg'), 'Brasil', 11, 81, 24, 'TOP5'),
  mk('Pedro', 'Pedro Guilherme Abreu dos Santos', 'FW', 'Flamengo', wiki('Pedro_(footballer,_born_1997).jpg'), 'Brasil', 9, 80, 28, 'BR1', { pace: 75, shooting: 84, physical: 78 }),
  mk('Bruno Henrique', 'Bruno Henrique Pinto', 'FW', 'Flamengo', wiki('Bruno_Henrique_2019.jpg'), 'Brasil', 27, 77, 35, 'BR1'),
  mk('Plata', 'Gonzalo Adolfo Plata Cevallos', 'FW', 'Flamengo', avatar('Plata', colorFor('Flamengo')), 'Equador', 21, 76, 24, 'BR1'),
  mk('Estêvão', 'Estêvão Willian Almeida de Oliveira Gonçalves', 'FW', 'Palmeiras', avatar('Estêvão', colorFor('Palmeiras')), 'Brasil', 41, 76, 18, 'BR1'),
  mk('Flaco López', 'José Ignacio López Fernández', 'FW', 'Palmeiras', avatar('Flaco López', colorFor('Palmeiras')), 'Argentina', 19, 75, 24, 'BR1'),
  mk('Yuri Alberto', 'Yuri Alberto Monteiro da Silva', 'FW', 'Corinthians', avatar('Yuri Alberto', colorFor('Corinthians')), 'Brasil', 9, 78, 24, 'BR1'),
  mk('Talles Magno', 'Talles Magno Bailão', 'FW', 'Corinthians', avatar('Talles Magno', colorFor('Corinthians')), 'Brasil', 23, 73, 23, 'BR1'),
  mk('Calleri', 'Jonathan Calleri Sánchez', 'FW', 'São Paulo', avatar('Calleri', colorFor('São Paulo')), 'Argentina', 9, 77, 31, 'BR1'),
  mk('Paulinho', 'José Paulo Bezerra Maciel Júnior', 'FW', 'Atlético-MG', wiki('Paulinho_(footballer,_born_1988).jpg'), 'Brasil', 8, 75, 37, 'BR1'),
  mk('Deyverson', 'Deyverson Brum Silva Acosta', 'FW', 'Atlético-MG', avatar('Deyverson', colorFor('Atlético-MG')), 'Brasil', 19, 74, 34, 'BR1'),
  mk('Luiz Henrique', 'Luiz Henrique de Andrade', 'FW', 'Botafogo', avatar('Luiz Henrique', colorFor('Botafogo')), 'Brasil', 11, 77, 23, 'BR1'),
  mk('Igor Jesus', 'Igor Jesus Maciel da Cruz', 'FW', 'Botafogo', avatar('Igor Jesus', colorFor('Botafogo')), 'Brasil', 9, 75, 24, 'BR1'),
  mk('Tiquinho Soares', 'Francisco das Chagas Soares dos Santos', 'FW', 'Botafogo', avatar('Tiquinho', colorFor('Botafogo')), 'Brasil', 19, 75, 39, 'BR1'),
  mk('Borré', 'Rafael Santos Borré Maury', 'FW', 'Internacional', avatar('Borré', colorFor('Internacional')), 'Colômbia', 19, 77, 30, 'BR1'),
  mk('Enner Valencia', 'Enner Remberto Valencia Lastra', 'FW', 'Internacional', avatar('Valencia', colorFor('Internacional')), 'Equador', 9, 77, 36, 'BR1'),
  mk('Soteldo', 'Yeferson Julio Soteldo Martínez', 'FW', 'Santos', avatar('Soteldo', colorFor('Santos')), 'Venezuela', 10, 76, 28, 'BR1'),
  mk('Guilherme', 'Guilherme da Silva Madalena', 'FW', 'Santos', avatar('Guilherme', colorFor('Santos')), 'Brasil', 9, 73, 24, 'BR1'),
  mk('Payet', 'Dimitri Payet', 'FW', 'Vasco', avatar('Payet', colorFor('Vasco')), 'França', 27, 76, 39, 'BR1'),
  mk('Vegetti', 'Pablo Federico Vegetti Sayago', 'FW', 'Vasco', avatar('Vegetti', colorFor('Vasco')), 'Argentina', 9, 75, 36, 'BR1'),
  mk('Everaldo', 'Everaldo Soares Ferreira', 'FW', 'Bahia', avatar('Everaldo', colorFor('Bahia')), 'Brasil', 9, 73, 31, 'BR1'),
  mk('Caio Paulista', 'Caio João Paulo da Silva', 'FW', 'Bahia', avatar('Caio Paulista', colorFor('Bahia')), 'Brasil', 11, 74, 29, 'BR1'),
  mk('Everaldo', 'Everaldo Marques da Silva', 'FW', 'Grêmio (1970)', avatar('Everaldo', colorFor('Grêmio')), 'Brasil', 6, 78, 28, 'BR1', {}, true),
  mk('Cauly', 'Cauly Oliveira Souza', 'FW', 'Fortaleza', avatar('Cauly', colorFor('Fortaleza')), 'Brasil', 10, 76, 31, 'BR1'),
  mk('Moisés', 'Moisés Vieira da Veiga', 'FW', 'Fortaleza', avatar('Moisés', colorFor('Fortaleza')), 'Brasil', 9, 74, 27, 'BR1'),
  mk('Gabriel Veron', 'Gabriel Veron Fernandes de Souza', 'FW', 'Cruzeiro', avatar('Veron', colorFor('Cruzeiro')), 'Brasil', 11, 75, 22, 'BR1'),

  // ===== LENDAS APOSENTADOS (Dream Team only) =====
  mk('Pelé', 'Edson Arantes do Nascimento', 'FW', 'Santos (retro)', wiki('Pele_con_brasil_%28cropped%29.jpg'), 'Brasil', 10, 98, 82, 'BR1', { pace: 92, shooting: 95, dribbling: 96, physical: 75 }, true),
  mk('Maradona', 'Diego Armando Maradona', 'FW', 'Napoli (retro)', wiki('Maradona-Mundial_86_con_la_copa.JPG'), 'Argentina', 10, 97, 60, 'TOP5', { pace: 88, shooting: 90, dribbling: 97, physical: 70 }, true),
  mk('Cruyff', 'Hendrik Johannes Cruijff', 'FW', 'Barcelona (retro)', wiki('Johan_Cruyff_1974_cropped.jpg'), 'Holanda', 14, 95, 68, 'TOP5', { pace: 90, shooting: 88, dribbling: 95 }, true),
  mk('Zidane', 'Zinedine Yazid Zidane', 'MF', 'Real Madrid (retro)', wiki('Zinedine_Zidane_2017.jpg'), 'França', 5, 95, 53, 'TOP5', { pace: 78, passing: 92, dribbling: 95 }, true),
  mk('Ronaldo R9', 'Ronaldo Luís Nazário de Lima', 'FW', 'Real Madrid (retro)', wiki('Ronaldo_2018.jpg'), 'Brasil', 9, 96, 48, 'TOP5', { pace: 92, shooting: 95, dribbling: 95, physical: 80 }, true),
  mk('Ronaldinho', 'Ronaldo de Assis Moreira', 'MF', 'Barcelona (retro)', wiki('Ronaldinho_2012.jpg'), 'Brasil', 10, 94, 45, 'TOP5', { pace: 84, shooting: 88, dribbling: 96 }, true),
  mk('Rivaldo', 'Vitor Borba Ferreira', 'MF', 'Barcelona (retro)', wiki('Rivaldo_2018.jpg'), 'Brasil', 10, 91, 53, 'TOP5', { pace: 80, shooting: 90, dribbling: 90 }, true),
  mk('Roberto Carlos', 'Roberto Carlos da Silva Rocha', 'LE', 'Real Madrid (retro)', wiki('Roberto_Carlos_2018.jpg'), 'Brasil', 6, 92, 52, 'TOP5', { pace: 92, shooting: 80, defending: 85, physical: 85 }, true),
  mk('Cafu', 'Marcos Evangelista de Moraes', 'LD', 'AS Roma (retro)', wiki('Cafu_2022.jpg'), 'Brasil', 2, 91, 54, 'TOP5', { pace: 90, defending: 86, physical: 84 }, true),
  mk('Beckenbauer', 'Franz Anton Beckenbauer', 'DF', 'Bayern Munich (retro)', wiki('Bundesliga_2016-_Franz_Beckenbauer_1.jpg'), 'Alemanha', 5, 93, 78, 'TOP5', { pace: 78, defending: 92, passing: 85 }, true),
  mk('Yashin', 'Lev Ivanovich Yashin', 'GK', 'Dynamo Moscow (retro)', wiki('Lev_Yashin_1967.jpg'), 'Rússia', 1, 93, 95, 'OTHER', {}, true),
  mk('Di Stéfano', 'Alfredo Stéfano Di Stéfano Laulhé', 'FW', 'Real Madrid (retro)', wiki('Alfredo_Di_Stefano_1959.jpg'), 'Argentina', 9, 95, 88, 'TOP5', { pace: 88, shooting: 92, dribbling: 92 }, true),
  mk('Puskás', 'Ferenc Puskás Bíró', 'FW', 'Real Madrid (retro)', wiki('Puskas_1962.jpg'), 'Hungria', 10, 94, 79, 'TOP5', { pace: 80, shooting: 95, physical: 82 }, true),
  mk('Garrincha', 'Manuel Francisco dos Santos', 'FW', 'Botafogo (retro)', wiki('Garrincha_no_Botafogo.jpg'), 'Brasil', 7, 92, 50, 'BR1', { pace: 95, dribbling: 96 }, true),
  mk('Zico', 'Arthur Antunes Coimbra', 'MF', 'Flamengo (retro)', wiki('Zico_2015.jpg'), 'Brasil', 10, 92, 72, 'BR1', { pace: 80, shooting: 90, passing: 92, dribbling: 92 }, true),
  mk('Romário', 'Romário de Souza Faria', 'FW', 'PSV (retro)', wiki('Romario_1994.jpg'), 'Brasil', 11, 92, 59, 'TOP5', { pace: 88, shooting: 95, dribbling: 90 }, true),
  mk('Bobby Charlton', 'Sir Robert Charlton', 'MF', 'Manchester United (retro)', wiki('Bobby_Charlton_1966.jpg'), 'Inglaterra', 9, 91, 86, 'TOP5', { pace: 78, shooting: 88, passing: 90 }, true),
  mk('Eusébio', 'Eusébio da Silva Ferreira', 'FW', 'Benfica (retro)', wiki('Eusebio_1965.jpg'), 'Portugal', 9, 92, 71, 'TOP10', { pace: 90, shooting: 93 }, true),
  mk('Platini', 'Michel François Platini', 'MF', 'Juventus (retro)', wiki('Michel_Platini_1984.jpg'), 'França', 10, 91, 70, 'TOP5', { passing: 92, shooting: 88, dribbling: 88 }, true),
  mk('Maldini', 'Paolo Cesare Maldini', 'DF', 'AC Milan (retro)', wiki('Paolo_Maldini_2007.jpg'), 'Itália', 3, 92, 56, 'TOP5', { pace: 80, defending: 93, physical: 85 }, true),
]
