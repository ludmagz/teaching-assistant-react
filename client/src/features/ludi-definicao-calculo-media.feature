Feature: Definição do cálculo de média
  As a professora
  I want to definir o modelo para o cálculo de médias de uma turma
  So that eu possa cadastrar, visualizar e modificar o modelo de avaliações da turma

  Scenario: Configuração bem-sucedida do modelo de notas numéricas simples
    Given o sistema não possui regras de cálculo definidas para a turma "Engenharia de Software e Sistemas"
    And eu acesso o sistema na página de configurações da turma
    When eu seleciono o modelo de avaliação "Numérico de 0 a 10 sem pesos"
    And defino a média de corte para aprovação como "7.0"
    And confirmo a gravação dos dados
    Then o sistema armazena o modelo numérico, e a nota de corte "7.0" para a turma "Engenharia de Software e Sistemas"
    And retorna uma mensagem de confirmação da configuração

  Scenario: Configuração bem-sucedida do modelo de notas numéricas com pesos
    Given o sistema não possui regras de cálculo definidas para a turma "Engenharia de Software e Sistemas"
    And eu acesso o sistema na página de configurações da turma
    When eu seleciono o modelo de avaliação "Numérico de 0 a 10 com pesos"
    And defino a média de corte para aprovação como "7.0"
    And defino os pesos das avaliações como "1", "1", "1", "1", "1" e "5"
    And confirmo a gravação dos dados
    Then o sistema armazena o modelo numérico, a nota de corte "7.0", e os pesos "1", "1", "1", "1", "1" e "5" para a turma "Engenharia de Software e Sistemas"
    And retorna uma mensagem de confirmação da configuração

  Scenario: Configuração bem-sucedida da média mínima para a prova final
    Given o sistema não possui regras de cálculo definidas para a turma "Engenharia de Software e Sistemas"
    And eu acesso o sistema na página de configurações da turma
    When eu seleciono o modelo de avaliação "Numérico de 0 a 10 sem pesos"
    And defino a média de corte para aprovação como "7.0"
    And defino a média mínima para a prova final como "3.0"
    And confirmo a gravação dos dados
    Then o sistema armazena o modelo numérico, a nota de corte "7.0" e a média mínima para a prova final "3.0" para a turma "Engenharia de Software e Sistemas"
    And retorna uma mensagem de confirmação da configuração

  Scenario: Configuração bem-sucedida de modelo qualitativo baseado em conceitos
    Given o sistema não possui regras de cálculo definidas para a turma "Eletrônica"
    And eu acesso o sistema na página de configurações da turma
    When eu seleciono o modelo de avaliação "Conceitos (MA, MPA, MANA)"
    And confirmo a gravação dos dados
    Then o sistema armazena o modelo qualitativo para a turma "Eletrônica"
    And oculta o campo de média de corte numérica
    And retorna uma mensagem de confirmação da configuração

  Scenario: arredondamento da média para 1 casa decimal sempre para cima
    Given estou na página "Registro de Notas"
    And a opção "média simples" está selecionada
    And na linha da aluna "Marina" vejo as notas "10","9","8", "6", "6", "-" e média "-"
    When registro a nota "2" na ultima nota
    Then na linha da aluna "Marina" vejo as notas "10","9","8", "6", "6", "2" e média "6.9"
    And retorna a mensagem de que a nota da aluna "Marina" foi alterada com sucesso

  Scenario: Tentativa de configuração com nota de corte inválida
    Given eu acesso o sistema na página de configurações da turma "Física 3"
    When eu seleciono o modelo de avaliação "Numérico de 0 a 10 sem pesos"
    And defino a média de corte para aprovação como "11.5"
    And confirmo a gravação dos dados
    Then o sistema recusa o armazenamento
    And exibe uma mensagem de erro informando que a nota de corte deve estar entre 0 e 10

  Scenario: Tentativa de configuração inválida de pesos no modelo numérico com pesos
    Given eu acesso o sistema na página de configurações da turma "Física 3"
    When eu seleciono o modelo de avaliação "Numérico de 0 a 10 com pesos"
    And defino a média de corte para aprovação como "7.0"
    And defino os pesos das avaliações como "1", "3", "3", "4", "1" e "5"
    And confirmo a gravação dos dados
    Then o sistema recusa o armazenamento
    And exibe uma mensagem de erro informando que a soma dos pesos deve resultar 10.

  Scenario: Tentativa de configuração com média mínima para a prova final maior que a nota de corte
    Given eu acesso o sistema na página de configurações da turma "Física 3"
    When eu seleciono o modelo de avaliação "Numérico de 0 a 10 sem pesos"
    And defino a média de corte para aprovação como "7.0"
    And defino a média mínima para a prova final como "8.0"
    And confirmo a gravação dos dados
    Then o sistema recusa o armazenamento
    And exibe uma mensagem de erro informando que a média mínima para a prova final deve estar entre 0 e a nota de corte
