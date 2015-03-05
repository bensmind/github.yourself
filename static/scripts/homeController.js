
Array.prototype.flatten= function(fun){
    if(typeof fun!= 'function') fun= '';
    var A= [], L= this.length, itm;
    for(var i= 0; i<L; i++){
        itm= this[i];
        if(itm!= undefined){
            if(!itm.flatten){
                if(fun) itm= fun(itm);
                if(itm) A.push(itm);
            }
            else A= A.concat(itm.flatten(fun));
        }
    }
    return A;
}

var mod = angular.module('ghys', [ 'chart.js' ])
mod.constant('moment', moment)
mod.value('$user', user);

mod.controller('homeCtrl', ['$scope', '$http', '$user', '$q', 'moment', function($scope, $http, $user, $q, moment){
    $scope.user = $user;

    if($scope.user.accessToken) {
        //Logged in
        $http.defaults.headers.common.Authorization = 'Token ' + $user.accessToken;
    }
    else{
        return; //Not logged in
    }

    $scope.user.repos = [];
    $scope.user.orgs = [];

    $scope.chart ={
        type:"StackedBar",
        options:{
            responsive:true,
            scaleBeginAtZero : false,
            barStrokeWidth : 1
        },
        labels:[],
        series:['Additions', 'Deletions'],
        data:[],
        colours:['#55a532','#bd2c00'],
        controls:{
            startDate: moment().subtract(3, 'month').toDate(),
            endDate: moment().toDate()
        }
    };

    var utcOffset = moment().utcOffset(); //In minutes

    $scope.$watch('chart.controls', function(newVal){
        if(!newVal || !newVal.startDate || !newVal.endDate)return;

        return pushChartData(newVal.startDate, newVal.endDate)
    }, true);

    var pushChartData = function(startDate, endDate){
        startDate = moment(startDate), endDate = moment(endDate);

        var repoContributions = $scope.user.repos.filter(function(r){
            return r.contribution;
        }).map(function(f){return f.contribution;});

        var additions = [], deletions = [], labels = [];
        var weeks = repoContributions.map(function(rc){return rc.weeks;}).flatten()
            .filter(function(w){
                return moment.unix(w.w).isBetween(startDate, endDate);
            });

        var currentWeek = startDate.add(1, 'w').startOf('week').add(utcOffset, 'minutes');

        while(currentWeek < endDate)
        {
            var repoWeeks = weeks.filter(function(w) {
                return w.w == currentWeek.unix();
            });
            var additionsSum = repoWeeks.reduce(function(prev, curr){return prev + curr.a;}, 0);
            var deletionsSum = repoWeeks.reduce(function(prev, curr) {return prev + curr.d;}, 0);

            labels.push(currentWeek.format('D-MMM-YY'));
            additions.push(additionsSum);
            deletions.push(deletionsSum);

            currentWeek.add(1, 'week');
        }
        $scope.chart.labels = labels;
        $scope.chart.data = [additions, deletions];
    };



    var loadRepos = getUserRepos($user)
        .then(function(repos){
            return repos.map(function(repo){
                return getContributions(repo)
                    .then(function(repoWithContributions){
                        user.repos.push(repoWithContributions);
                    });
            });
        });

    var loadOrgRepos = getUserOrgs($user)
        .then(function(orgs){
            return orgs.map(function(org){
                org.repos = [];
                $user.orgs.push(org);
                return $q.all(getOrgRepos(org)
                    .then(function(repos){
                        return repos.map(function(repo){
                            return getContributions(repo)
                                .then(function(repoWithContributions){
                                    org.repos.push(repoWithContributions);
                                    return repoWithContributions;
                                });
                            });
                    })
                    .then(function(){return org;})
                );
            });
        });



    $q.all([loadRepos, loadOrgRepos]).then(function(){
        return pushChartData($scope.chart.controls.startDate, $scope.chart.controls.endDate);
    }).then(function(){
        $scope.loading = false;
    });

    function getUserRepos(user){
        return $http({method:'GET', url:user._json.repos_url})
            .then(function(result){
                updateRateLimit(result.headers);
                return result.data;
            });
    }
    function getUserOrgs(user){
        return $http({method:'GET', url:user._json.organizations_url})
            .then(function(result){
                updateRateLimit(result.headers);
                return result.data;
            });
    }

    function getOrgRepos(org){
        return $http({method:'GET', url:org.repos_url})
            .then(function(result){
                updateRateLimit(result.headers);
                return result.data;
            });
    }

    function getContributions(repo) {
        return $http({method: 'GET', url: repo.url + '/stats/contributors'})
            .then(function (result) {
                updateRateLimit(result.headers);
                if(!result.data || !result.data.length) {
                    debugger;
                    return;
                }
                var contribution = result.data.filter(function (contrib) {
                    return contrib.author.login === $user._json.login;
                })[0];
                repo.contribution = contribution;
                return repo;
            });
    };

    function updateRateLimit(headers){
        $scope.rateLimit = headers && headers()['x-ratelimit-remaining'] || $scope.rateLimit || 0;
    }
}]);


