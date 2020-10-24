# <a href='https://www.meteor.com'><img src='https://user-images.githubusercontent.com/841294/26841702-0902bbee-4af3-11e7-9805-0618da66a246.png' height='60' alt='Meteor'></a>

[![TravisCI Status](https://travis-ci.org/meteor/meteor.svg?branch=devel)](https://travis-ci.org/meteor/meteor)
[![CircleCI Status](https://circleci.com/gh/meteor/meteor/tree/devel.svg?style=shield&circle-token=c2d3c041506bd493ef3795ffa4448684cfce97b8)](https://circleci.com/gh/meteor/meteor/tree/devel)

Meteor é um ambiente ultra-simples para construir aplicações web modernas.

Com Meteor você escreve aplicações:

* em JavaScript moderno
* que manda dados pelo wire, ao invés de HTML
* usando sua escolha de bibliotecas open-source populares

Tente um tutorial para começar:
 * [React](https://react-tutorial.meteor.com) - novo
 * [Blaze](https://www.meteor.com/tutorials/blaze/creating-an-app)
 * [Angular](https://www.meteor.com/tutorials/angular/creating-an-app)
 * [Vue](https://www.meteor.com/tutorials/vue/creating-an-app)
 * [Svelte](https://www.meteor.com/tutorials/svelte/creating-an-app)

Depois, leia a [guia](https://guide.meteor.com) e a [documentação](https://docs.meteor.com/).

## Começo Rápido

No Windows, o instalador pode ser achado em https://www.meteor.com/install.

No Linux/macOS, use isso:

```bash
curl https://install.meteor.com/ | sh
```

Crie um projeto:

```bash
meteor create try-meteor
```

Use o comando:

```bash
cd try-meteor
meteor
```

## Developer Resources

Construindo uma aplicação com Meteor?

* Inicialize no hosting Galaxy: https://www.meteor.com/hosting
* Lista de anúncios: se inscreva em https://www.meteor.com/
* Tendo problemas? Peça por ajuda em: https://stackoverflow.com/questions/tagged/meteor
* Fóruns de discussão: https://forums.meteor.com/
* Entre na comunidade do Meteor no Slack clicando aqui [link de convite](https://join.slack.com/t/meteor-community/shared_invite/enQtODA0NTU2Nzk5MTA3LWY5NGMxMWRjZDgzYWMyMTEyYTQ3MTcwZmU2YjM5MTY3MjJkZjQ0NWRjOGZlYmIxZjFlYTA5Mjg4OTk3ODRiOTc).
 

Interessado em ajudar ou contribuir para o Meteor? Esses recursos vão ajudar:

* [Guia principal de desenvolvimento](DEVELOPMENT.md)
* [Guias de contribuição](CONTRIBUTING.md)
* [Requisição de recursos](https://github.com/meteor/meteor-feature-requests/)
* [Rastreador de Issues](https://github.com/meteor/meteor/issues)

## Desinstalando Meteor

Sem ser pelo pequeno script launcher shell, o Meteor se instala dentro de seu diretório principal. Para desinstalar Meteor, use:

```bash
rm -rf ~/.meteor/
sudo rm /usr/local/bin/meteor
```

No Windows, apenas use o desinstalador pelo seu Painel de Controle.