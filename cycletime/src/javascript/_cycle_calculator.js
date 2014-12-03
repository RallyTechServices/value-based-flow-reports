/*
 * override the call to load the store so that users who don't have permissions
 * don't get locked out of seeing things they do have permissions for.
 * 
 */
Ext.override(Rally.ui.chart.Chart,{
    _loadStore: function (storeConfig, storeRank) {
        var self = this;

        Ext.merge(storeConfig, {
            exceptionHandler: function (proxy, response, operation) {
                if (response.status !== 200) {
                    self.queryValid = false;
                }

                if (response.status === 409) {
                    self.workspaceHalted = true;
                } else if (response.status === 503) {
                    self.serviceUnavailable = true;
                }
            }
        });

        storeConfig.limit = storeConfig.limit || Infinity;

        var store = Ext.create(this.storeType, storeConfig);
        store.rank = storeRank;

        store.on('load', this._storeLoadHandler, this);
        store.load({params: { removeUnauthorizedSnapshots: true } });
    }
});

Ext.define('CycleCalculator', {
    extend: 'Rally.data.lookback.calculator.BaseCalculator',
    initial_state: "In-Progress",
    final_state:"Accepted",
    group_field: 'ScheduleState',
    
    runCalculation: function(snapshots) {
        var final_state = this.final_state;
        var initial_state = this.initial_state;
        console.log(initial_state,final_state,snapshots);
        
        /* iterate over the snapshots (each of which represents a transition
         * 1.  Save the ones that are transitioning INTO the initial state in a hash by object id so that
         *     we can retrieve it for the cycle time
         * 2.  For the ones that are transitioning INTO the final state, find the _validfrom from the hash
         *     and calculate the cycle time
         *     
         */
         var starts_by_oid = {};
         Ext.Array.each(snapshots, function(snapshot){
            // _PreviousValues.ScheduleState == null means we got created right into the state
            // _PreviousValues.ScheduleState == undefined means this particular change wasn't a transition (so we'll look for > 0)
            // TODO: check for just after the initial_state?  skipping is a problem to solve.
            var state = snapshot[this.group_field];
            var previous_state = -1;
            
            // sometimes snapshots are missing the "_PreviousValues" hash. not sure why
            if ( snapshot._PreviousValues ) {
                previous_state = snapshot._PreviousValues[this.group_field];
            }
            console.log( state, previous_state );
            if (state == initial_state && ( previous_state === null || previous_state > 0 ) ) {
                starts_by_oid[snapshot.ObjectID] = snapshot;
            }
            
            if ( state == final_state && previous_state > 0  ) {
                if ( starts_by_oid[snapshot.ObjectID] ) { 
                    starts_by_oid[snapshot.ObjectID]._final_date = snapshot._ValidFrom;
                }
            }
         }, this);
         console.log("starts_by_oid", starts_by_oid);
        
         var snaps_by_date = this._getSnapsByFinalDate(starts_by_oid);
         console.log("Snaps_by_Date", snaps_by_date);
         
         var snaps_by_date_filled_in = this._orderAndFillDateHash(snaps_by_date);
         console.log("snaps_by_date_filled_in", snaps_by_date_filled_in);
         
         var cycle_times_by_date = this._getCycleTimes(snaps_by_date_filled_in);
         console.log("Cycle Times", cycle_times_by_date);
         
//        var data = [1,5,8,25];
//        var categories = [ "10/1", "10/2", "10/3", "10/4"];
         
         var data = [];
         var categories = [];
         Ext.Object.each( cycle_times_by_date, function(key_date, cycle_time){
            data.push(cycle_time);
            categories.push(key_date);
         });
        
        return {
            series: [
            {
                name: 'Average Cycle Time',
                data: data
            }],
            categories: categories
        }
    },
    _getSnapsByFinalDate: function(starts_by_oid) {
        var snaps_by_date = {};
        Ext.Object.each(starts_by_oid, function(oid, snapshot) {
            if ( snapshot._final_date ) {
                var key_date = snapshot._final_date;
                var short_date = snapshot._final_date.replace(/T.*$/,'');
                if ( ! snaps_by_date[short_date] ) {
                    snaps_by_date[short_date] = [];
                }
                snaps_by_date[short_date].push(snapshot);
            }
        });
        
        return snaps_by_date;
    },
    _getCycleTimes: function(snaps_by_date){
        var cycle_times_by_date = {};
        
        Ext.Object.each( snaps_by_date, function( key_date, snapshots ) {
            var time_array = [];
            Ext.Array.each(snapshots,function(snapshot){
                var begin_time = Rally.util.DateTime.fromIsoString(snapshot._ValidFrom);
                var end_time = Rally.util.DateTime.fromIsoString(snapshot._final_date);
                var cycle_time = Rally.util.DateTime.getDifference(end_time,begin_time,'day');
                time_array.push(cycle_time);
            });
            cycle_times_by_date[key_date] = Ext.Array.mean(time_array) || null;
        });
        
        return cycle_times_by_date;
    },
    _orderAndFillDateHash: function(snaps_by_date){
        // put existing keys in order:
        var filled_snaps = {};
       
        var keys = Ext.Object.getKeys(snaps_by_date);
        if ( keys.length > 0 ) {
            var min = Ext.Array.min(keys);
            var first_date = Rally.util.DateTime.fromIsoString(min);
            var today = new Date();
            
            var check_date = first_date;
            while( check_date < today ) {
                var iso_date = Rally.util.DateTime.toIsoString(check_date).replace(/T.*$/,"");
                filled_snaps[iso_date] = [];
                if ( snaps_by_date[iso_date] ) {
                    filled_snaps[iso_date] = snaps_by_date[iso_date];
                }
                check_date = Rally.util.DateTime.add(check_date,'day',1);
            }
        }
        return filled_snaps;
    }
});