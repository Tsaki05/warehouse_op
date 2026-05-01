.PHONY: build up down migrate seed test shell logs

build:
	docker-compose build

up:
	docker-compose up -d

down:
	docker-compose down

migrate:
	docker-compose exec backend python manage.py makemigrations
	docker-compose exec backend python manage.py migrate

seed:
	docker-compose exec backend python manage.py shell -c "from seed.seed import seed; seed()"

test:
	docker-compose exec backend python manage.py test

shell:
	docker-compose exec backend python manage.py shell

logs:
	docker-compose logs -f backend

createsuperuser:
	docker-compose exec backend python manage.py createsuperuser
