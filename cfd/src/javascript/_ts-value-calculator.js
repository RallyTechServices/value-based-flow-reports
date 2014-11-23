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

Ext.define("Rally.technicalservices.ValueCFDCalculator", {
    extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
    config: {
        /*
         * Required
         */
        group_field: null,
        /*
         * Name of field that holds the value to add up
         * (Required if type is "sum")
         */
        value_field: null, 
        /*
         * allowed_values (Required): array of available values in field to group by
         */
         allowed_values: null
    },
    constructor: function(config){
        this.callParent(arguments);
        if (!this.allowed_values || this.allowed_values.length == 0) {
            throw "Cannot create Rally.technicalservices.ValueCFDCalculator without allowed_values";
        }
        if (!this.group_field) {
            throw "Cannot create Rally.technicalservices.ValueCFDCalculator without group_field";
        }
        if (!this.value_field) {
            throw "Cannot create Rally.technicalservices.ValueCFDCalculator by sum without value_field";
        }
    },
    /*
     * How to measure
     * 
     * { 
     *      field       : the field that has the value to add up on each day
     *      as          : the name to display in the legend
     *      display     : "line" | "column" | "area"
     *      f           : function to use (e.g., "sum", "filteredSum"
     *      filterField : (when f=filteredSum) field with values used to group by (stacks on column)
     *      filterValues: (when f=filteredSum) used to decide which values of filterField to show
     */
    getMetrics: function () {
        var metric = {
            f: 'groupBySum',
            field: this.value_field, 
            groupByField: this.group_field, 
            allowedValues: this.allowed_values,
            display:'area'
        };
        
        return [ metric ];
    },
    /*
     * WSAPI will give us allowed values that include "", but the
     * snapshot will actually say null
     * 
     */
    _convertNullToBlank:function(snapshots){
        var number_of_snapshots = snapshots.length;
        for ( var i=0;i<number_of_snapshots;i++ ) {
            if ( snapshots[i][this.group_by_field] === null ) {
                snapshots[i][this.group_by_field] = "";
            }
        }
        return snapshots;
    },
    /*
     * For some reason, there are undefineds in the value fields sometimes
     * 
     */
    _convertUndefinedToNumber:function(snaps){
        var snapshots = Ext.clone(snaps);
        var number_of_snapshots = snapshots.length;
        var allowed_values = this.allowed_values;
        var number_of_allowed_values = allowed_values.length;
        
        for ( var i=0;i<number_of_snapshots;i++ ) {
            if ( !snapshots[i][this.value_field] ) {
                snapshots[i][this.value_field] = 0;
            }
        }
        return snapshots;
    },
    runCalculation: function(snapshots){
        var calculatorConfig = this._prepareCalculatorConfig(),
        seriesConfig = this._buildSeriesConfig(calculatorConfig);

        var calculator = this.prepareCalculator(calculatorConfig);
        
        var clean_snapshots = this._convertNullToBlank(snapshots);

        clean_snapshots = this._convertUndefinedToNumber(snapshots);
        
        if ( clean_snapshots.length > 0 ) {
            calculator.addSnapshots(clean_snapshots, this._getStartDate(clean_snapshots), this._getEndDate(clean_snapshots));
        }
        var chart_data = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);
        
        // check for false
        Ext.Array.each(chart_data.series,function(series){
            if ( series.name === "" ) {
                series.name = "None";
            }
            
            if (series.name === false) {
                series.name = "False";
            }
            
            if (series.name == true) {
                series.name = "True";
            }
        });
        
        var formatted_dates = [];
        Ext.Array.each(chart_data.categories,function(category){
            var d = Rally.util.DateTime.fromIsoString(category);
            formatted_dates.push(Ext.util.Format.date(d,'d-m-Y'));
        });
        chart_data.categories = formatted_dates;
        
        console.log("chart data", chart_data);
        return chart_data;
    },
    /*
     * Modified to allow groupBySum/groupByCount to spit out stacked area configs
     */
    _buildSeriesConfig: function (calculatorConfig) {
        var aggregationConfig = [],
            metrics = calculatorConfig.metrics,
            derivedFieldsAfterSummary = calculatorConfig.deriveFieldsAfterSummary;

        for (var i = 0, ilength = metrics.length; i < ilength; i += 1) {
            var metric = metrics[i];
            if ( metric.f == "groupBySum" || metric.f == "groupByCount") {
                var type = metric.f.replace(/groupBy/,"");
                
                if ( ! metric.allowedValues ) {
                    throw "Rally.TechnicalServices.CFDCalculator requires setting 'allowed_values'";
                }
                Ext.Array.each(metric.allowedValues,function(allowed_value){
                    aggregationConfig.push({
                        f: type,
                        name: allowed_value,
                        type: metric.display || "area",
                        dashStyle: metric.dashStyle || "Solid",
                        stack: 1
                    });
                });
            } else {
                aggregationConfig.push({
                    name: metric.as || metric.field,
                    type: metric.display,
                    dashStyle: metric.dashStyle || "Solid",
                    stack: 1
                });
            }
        }

        for (var j = 0, jlength = derivedFieldsAfterSummary.length; j < jlength; j += 1) {
            var derivedField = derivedFieldsAfterSummary[j];
            aggregationConfig.push({
                name: derivedField.as,
                type: derivedField.display,
                dashStyle: derivedField.dashStyle || "Solid"
            });
        }

        return aggregationConfig;
    }
});